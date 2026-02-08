import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface UseCase {
  id: string;
  title: string;
  category: string;
  sub_category: string;
  engagement_category: string | null;
  whats_included: string | null;
  key_deliverables: string | null;
  why_it_matters: string | null;
  how_its_delivered: string | null;
  use_case_number: number | null;
}

interface CapturedResponse {
  sectionTitle: string;
  questionText: string;
  answer: string | string[];
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { submission_id } = await req.json();

    if (!submission_id) {
      return new Response(
        JSON.stringify({ error: "submission_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with service role key for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch submission details
    const { data: submission, error: subErr } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", submission_id)
      .single();

    if (subErr || !submission) {
      return new Response(
        JSON.stringify({ error: "Submission not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch all responses with question text for captured responses
    const { data: responses, error: respErr } = await supabase
      .from("responses")
      .select("question_id, answer, questions(question_text, sections(title))")
      .eq("submission_id", submission_id);

    if (respErr || !responses) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch responses" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build captured responses list
    // deno-lint-ignore no-explicit-any
    const capturedResponses: CapturedResponse[] = responses.map((r: any) => ({
      sectionTitle: r.questions?.sections?.title || "Unknown Section",
      questionText: r.questions?.question_text || "Unknown Question",
      answer: r.answer,
    }));

    // 3. For each answer, query decision_matrix for matching use cases
    const useCaseScores: Record<string, number> = {};

    for (const response of responses) {
      const answerValue = response.answer;
      const answersToCheck: string[] = Array.isArray(answerValue)
        ? answerValue
        : [answerValue];

      for (const answer of answersToCheck) {
        const { data: matches } = await supabase
          .from("decision_matrix")
          .select("use_case_id")
          .eq("question_id", response.question_id)
          .eq("triggering_answer", answer);

        if (matches) {
          for (const match of matches) {
            useCaseScores[match.use_case_id] =
              (useCaseScores[match.use_case_id] || 0) + 1;
          }
        }
      }
    }

    // 4. Get ALL use cases sorted by score (not just top 5)
    const sortedEntries = Object.entries(useCaseScores)
      .sort(([, a], [, b]) => b - a);

    const sortedIds = sortedEntries.map(([id]) => id);

    let recommendedUseCases: UseCase[] = [];

    if (sortedIds.length > 0) {
      const { data: matchedUseCases } = await supabase
        .from("use_cases")
        .select("*")
        .in("id", sortedIds);

      if (matchedUseCases) {
        recommendedUseCases = sortedIds
          .map((id) => matchedUseCases.find((uc: UseCase) => uc.id === id))
          .filter((uc): uc is UseCase => uc !== undefined);
      }
    }

    // 5. Send email via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const adminEmail = Deno.env.get("ADMIN_EMAIL_ADDRESS");

    if (resendApiKey && adminEmail) {
      const emailHtml = buildEmailHtml(submission, recommendedUseCases, capturedResponses);

      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "SAP BTP Recommendations <onboarding@resend.dev>",
            to: [adminEmail],
            subject: `New SAP BTP Assessment: ${submission.company_name} - ${submission.full_name}`,
            html: emailHtml,
          }),
        });

        if (!emailRes.ok) {
          const errBody = await emailRes.text();
          console.error("Resend API error:", errBody);
        }
      } catch (emailErr) {
        console.error("Failed to send email:", emailErr);
        // Don't fail the whole request if email fails
      }
    }

    // 6. Return ALL recommendations + captured responses
    return new Response(
      JSON.stringify({
        success: true,
        recommended_use_cases: recommendedUseCases,
        captured_responses: capturedResponses,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

const categoryColors: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: "#dcfce7", text: "#166534", label: "Fixed Scope" },
  B: { bg: "#dbeafe", text: "#1e40af", label: "Discovery + Fixed" },
  C: { bg: "#ffedd5", text: "#9a3412", label: "T-Shirt Sizing" },
};

function engagementBadgeHtml(category: string | null): string {
  if (!category) return "";
  const style = categoryColors[category] || categoryColors.B;
  return `<span style="display:inline-block;background:${style.bg};color:${style.text};padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Category ${category} &mdash; ${style.label}</span>`;
}

// deno-lint-ignore no-explicit-any
function buildEmailHtml(submission: any, useCases: UseCase[], capturedResponses: CapturedResponse[]): string {
  const topFive = useCases.slice(0, 5);
  const remaining = useCases.slice(5);

  // Build top 5 use case cards
  const topFiveHtml = topFive
    .map(
      (uc, i) => `
      <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:16px;overflow:hidden;">
        <div style="padding:16px;border-bottom:1px solid #f3f4f6;">
          <table style="width:100%;"><tr>
            <td style="width:36px;vertical-align:top;">
              <div style="width:32px;height:32px;border-radius:50%;background:#2563eb;color:#fff;text-align:center;line-height:32px;font-weight:bold;font-size:14px;">${i + 1}</div>
            </td>
            <td style="vertical-align:top;">
              <div style="font-weight:600;font-size:15px;color:#111827;">${uc.use_case_number ? `#${uc.use_case_number} &mdash; ` : ""}${uc.title}</div>
              <div style="margin-top:6px;">
                ${engagementBadgeHtml(uc.engagement_category)}
                <span style="display:inline-block;background:#f3f4f6;color:#374151;padding:2px 8px;border-radius:12px;font-size:11px;margin-left:4px;">${uc.category}</span>
                <span style="display:inline-block;background:#f3e8ff;color:#7c3aed;padding:2px 8px;border-radius:12px;font-size:11px;margin-left:4px;">${uc.sub_category}</span>
              </div>
            </td>
          </tr></table>
        </div>
        <div style="padding:16px;">
          ${uc.why_it_matters ? `<div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">Why It Matters</div><div style="font-size:13px;color:#374151;line-height:1.5;">${uc.why_it_matters}</div></div>` : ""}
          ${uc.whats_included ? `<div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">What's Included</div><div style="font-size:13px;color:#4b5563;line-height:1.5;">${uc.whats_included}</div></div>` : ""}
          ${uc.key_deliverables ? `<div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">Key Deliverables</div><div style="font-size:13px;color:#4b5563;line-height:1.5;">${uc.key_deliverables}</div></div>` : ""}
          ${uc.how_its_delivered ? `<div><div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">How It's Delivered</div><div style="font-size:13px;color:#4b5563;line-height:1.5;">${uc.how_its_delivered}</div></div>` : ""}
        </div>
      </div>`
    )
    .join("");

  // Build remaining use cases as compact list
  const remainingRows = remaining
    .map(
      (uc) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
          <span style="font-weight:500;color:#111827;font-size:13px;">${uc.use_case_number ? `#${uc.use_case_number} &mdash; ` : ""}${uc.title}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
          <span style="display:inline-block;background:#f3f4f6;color:#374151;padding:2px 8px;border-radius:12px;font-size:11px;">${uc.category}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
          <span style="font-size:12px;color:#6b7280;">${uc.sub_category}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
          ${engagementBadgeHtml(uc.engagement_category)}
        </td>
      </tr>`
    )
    .join("");

  // Build captured responses grouped by section
  const responsesBySection: Record<string, CapturedResponse[]> = {};
  for (const cr of capturedResponses) {
    if (!responsesBySection[cr.sectionTitle]) {
      responsesBySection[cr.sectionTitle] = [];
    }
    responsesBySection[cr.sectionTitle].push(cr);
  }

  const capturedResponsesHtml = Object.entries(responsesBySection)
    .map(
      ([section, responses]) => `
      <tr><td colspan="2" style="padding:10px 12px;background:#f9fafb;font-weight:600;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;">${section}</td></tr>
      ${responses
        .map(
          (r) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#4b5563;font-size:13px;width:50%;">${r.questionText}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#111827;font-size:13px;font-weight:500;">${Array.isArray(r.answer) ? r.answer.join(", ") : r.answer}</td>
        </tr>`
        )
        .join("")}`
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 20px;">
      <div style="max-width: 700px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

        <div style="background: #1e40af; padding: 24px 32px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px;">New SAP BTP Assessment Submission</h1>
        </div>

        <div style="padding: 32px;">
          <!-- Section 1: Customer Details -->
          <h2 style="color: #111827; font-size: 16px; margin: 0 0 16px 0;">Customer Details</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; font-weight: 600; width: 140px; border: 1px solid #e5e7eb;">Name</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${submission.full_name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; font-weight: 600; border: 1px solid #e5e7eb;">Email</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;"><a href="mailto:${submission.email}">${submission.email}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; font-weight: 600; border: 1px solid #e5e7eb;">Company</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${submission.company_name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; font-weight: 600; border: 1px solid #e5e7eb;">Job Title</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${submission.job_title || "&mdash;"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; font-weight: 600; border: 1px solid #e5e7eb;">Country</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${submission.country || "&mdash;"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; font-weight: 600; border: 1px solid #e5e7eb;">Submitted</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${new Date(submission.created_at).toLocaleString()}</td>
            </tr>
          </table>

          <!-- Section 2: Captured Responses -->
          <h2 style="color: #111827; font-size: 16px; margin: 0 0 16px 0;">Captured Responses</h2>
          ${
            capturedResponses.length > 0
              ? `
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 10px 12px; border-bottom: 2px solid #e5e7eb; text-align: left; font-size: 13px;">Question</th>
                <th style="padding: 10px 12px; border-bottom: 2px solid #e5e7eb; text-align: left; font-size: 13px;">Answer</th>
              </tr>
            </thead>
            <tbody>
              ${capturedResponsesHtml}
            </tbody>
          </table>`
              : `<p style="color: #6b7280; margin-bottom: 32px;">No responses captured.</p>`
          }

          <!-- Section 3: Top 5 Recommendations -->
          <h2 style="color: #111827; font-size: 16px; margin: 0 0 16px 0;">Top 5 Recommended Use Cases</h2>
          ${
            topFive.length > 0
              ? topFiveHtml
              : `<p style="color: #6b7280;">No specific recommendations were generated. Manual review recommended.</p>`
          }

          <!-- Section 4: Additional Applicable Use Cases -->
          ${
            remaining.length > 0
              ? `
          <h2 style="color: #111827; font-size: 16px; margin: 24px 0 16px 0;">Additional Applicable Use Cases (${remaining.length})</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 10px 12px; border-bottom: 2px solid #e5e7eb; text-align: left; font-size: 13px;">Use Case</th>
                <th style="padding: 10px 12px; border-bottom: 2px solid #e5e7eb; text-align: center; font-size: 13px;">Category</th>
                <th style="padding: 10px 12px; border-bottom: 2px solid #e5e7eb; text-align: center; font-size: 13px;">Sub-Category</th>
                <th style="padding: 10px 12px; border-bottom: 2px solid #e5e7eb; text-align: center; font-size: 13px;">Engagement</th>
              </tr>
            </thead>
            <tbody>
              ${remainingRows}
            </tbody>
          </table>`
              : ""
          }
        </div>

        <div style="background: #f9fafb; padding: 16px 32px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">SAP BTP Use Case Recommendation Platform</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
