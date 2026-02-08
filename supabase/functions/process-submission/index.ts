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
  score: number;
}

interface CapturedResponse {
  sectionTitle: string;
  questionText: string;
  answer: string | string[];
}

serve(async (req: Request) => {
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

    // 2. Fetch all responses with question text
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

    // 3. Score use cases via decision matrix WITH WEIGHTS
    const useCaseScores: Record<string, number> = {};

    for (const response of responses) {
      const answerValue = response.answer;
      const answersToCheck: string[] = Array.isArray(answerValue)
        ? answerValue
        : [answerValue];

      for (const answer of answersToCheck) {
        const { data: matches } = await supabase
          .from("decision_matrix")
          .select("use_case_id, weight")
          .eq("question_id", response.question_id)
          .eq("triggering_answer", answer);

        if (matches) {
          for (const match of matches) {
            // deno-lint-ignore no-explicit-any
            const weight = (match as any).weight || 1;
            useCaseScores[match.use_case_id] =
              (useCaseScores[match.use_case_id] || 0) + weight;
          }
        }
      }
    }

    // 4. Filter by minimum score and sort
    const MIN_SCORE = 3;
    const sortedEntries = Object.entries(useCaseScores)
      .filter(([, score]) => score >= MIN_SCORE)
      .sort(([, a], [, b]) => b - a);

    const sortedIds = sortedEntries.map(([id]) => id);
    const scoreMap = Object.fromEntries(sortedEntries);

    let recommendedUseCases: UseCase[] = [];

    if (sortedIds.length > 0) {
      const { data: matchedUseCases } = await supabase
        .from("use_cases")
        .select("*")
        .in("id", sortedIds);

      if (matchedUseCases) {
        recommendedUseCases = sortedIds
          // deno-lint-ignore no-explicit-any
          .map((id) => {
            // deno-lint-ignore no-explicit-any
            const uc = matchedUseCases.find((u: any) => u.id === id);
            if (!uc) return undefined;
            return { ...uc, score: scoreMap[id] || 0 } as UseCase;
          })
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
            subject: `SAP BTP Roadmap: ${submission.company_name} - ${submission.full_name}`,
            html: emailHtml,
          }),
        });

        if (!emailRes.ok) {
          const errBody = await emailRes.text();
          console.error("Resend API error:", errBody);
        }
      } catch (emailErr) {
        console.error("Failed to send email:", emailErr);
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

// Phase definitions for roadmap grouping
const phaseConfig: Record<string, { label: string; description: string; color: string; textColor: string }> = {
  A: { label: "Phase 1: Quick Wins", description: "Fixed-scope engagements — ready to start immediately", color: "#dcfce7", textColor: "#166534" },
  B: { label: "Phase 2: Discovery & Build", description: "Require discovery phase, followed by focused implementation", color: "#dbeafe", textColor: "#1e40af" },
  C: { label: "Phase 3: Strategic Initiatives", description: "Complex, high-impact programs requiring phased delivery", color: "#ffedd5", textColor: "#9a3412" },
};

function engagementBadgeHtml(category: string | null): string {
  if (!category) return "";
  const config = phaseConfig[category];
  if (!config) return "";
  return `<span style="display:inline-block;background:${config.color};color:${config.textColor};padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Category ${category}</span>`;
}

function relevanceBadgeHtml(score: number, maxScore: number): string {
  const pct = Math.round((score / Math.max(maxScore, 1)) * 100);
  let bg = "#f3f4f6";
  let color = "#4b5563";
  if (pct >= 70) { bg = "#dcfce7"; color = "#15803d"; }
  else if (pct >= 40) { bg = "#dbeafe"; color = "#1d4ed8"; }
  else if (pct >= 20) { bg = "#fef9c3"; color = "#a16207"; }
  return `<span style="display:inline-block;background:${bg};color:${color};padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;">${pct}% match</span>`;
}

// deno-lint-ignore no-explicit-any
function buildEmailHtml(submission: any, useCases: UseCase[], capturedResponses: CapturedResponse[]): string {
  const maxScore = useCases.length > 0 ? Math.max(...useCases.map(uc => uc.score), 1) : 1;

  // Group by engagement category for roadmap
  const phaseOrder = ["A", "B", "C"];
  const grouped: Record<string, UseCase[]> = {};
  for (const uc of useCases) {
    const key = uc.engagement_category || "B";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(uc);
  }

  // Build roadmap HTML
  let roadmapHtml = "";
  for (const phaseKey of phaseOrder) {
    const phaseUCs = grouped[phaseKey];
    if (!phaseUCs || phaseUCs.length === 0) continue;
    const config = phaseConfig[phaseKey];

    // Group by sub_category within phase
    const subGroups: Record<string, UseCase[]> = {};
    for (const uc of phaseUCs) {
      const sg = uc.sub_category || "Other";
      if (!subGroups[sg]) subGroups[sg] = [];
      subGroups[sg].push(uc);
    }

    roadmapHtml += `
      <div style="margin-bottom:24px;">
        <div style="background:${config.color};border-radius:8px 8px 0 0;padding:16px 20px;">
          <h3 style="margin:0;font-size:16px;color:${config.textColor};font-weight:700;">${config.label}</h3>
          <p style="margin:4px 0 0;font-size:12px;color:${config.textColor};opacity:0.8;">${config.description} &mdash; ${phaseUCs.length} use case${phaseUCs.length !== 1 ? "s" : ""}</p>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;">`;

    for (const [subCat, subUCs] of Object.entries(subGroups)) {
      roadmapHtml += `
          <div style="padding:8px 20px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
            <span style="font-size:12px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">${subCat} (${subUCs.length})</span>
          </div>`;

      // Show top 3 detailed, rest compact
      const top = subUCs.slice(0, 3);
      const rest = subUCs.slice(3);

      for (const uc of top) {
        roadmapHtml += `
          <div style="padding:16px 20px;border-bottom:1px solid #f3f4f6;">
            <div style="margin-bottom:6px;">
              <span style="font-weight:600;font-size:14px;color:#111827;">${uc.use_case_number ? `#${uc.use_case_number} &mdash; ` : ""}${uc.title}</span>
              <span style="margin-left:8px;">${relevanceBadgeHtml(uc.score, maxScore)}</span>
            </div>
            ${uc.why_it_matters ? `<div style="margin-top:8px;"><span style="font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;">Why It Matters</span><p style="margin:2px 0 0;font-size:13px;color:#374151;line-height:1.5;">${uc.why_it_matters}</p></div>` : ""}
            ${uc.whats_included ? `<div style="margin-top:6px;"><span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">What's Included</span><p style="margin:2px 0 0;font-size:13px;color:#4b5563;line-height:1.5;">${uc.whats_included}</p></div>` : ""}
            ${uc.key_deliverables ? `<div style="margin-top:6px;"><span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Key Deliverables</span><p style="margin:2px 0 0;font-size:13px;color:#4b5563;line-height:1.5;">${uc.key_deliverables}</p></div>` : ""}
          </div>`;
      }

      if (rest.length > 0) {
        for (const uc of rest) {
          roadmapHtml += `
          <div style="padding:8px 20px;border-bottom:1px solid #f3f4f6;">
            <span style="font-size:13px;color:#374151;">${uc.use_case_number ? `#${uc.use_case_number} &mdash; ` : ""}${uc.title}</span>
            <span style="margin-left:6px;">${relevanceBadgeHtml(uc.score, maxScore)}</span>
          </div>`;
        }
      }
    }

    roadmapHtml += `
        </div>
      </div>`;
  }

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
          <h1 style="color: #ffffff; margin: 0; font-size: 20px;">SAP BTP Implementation Roadmap</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 14px;">${submission.company_name} &mdash; ${submission.full_name}</p>
        </div>

        <div style="padding: 32px;">
          <!-- Customer Details -->
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

          <!-- Captured Responses -->
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

          <!-- Roadmap -->
          <h2 style="color: #111827; font-size: 16px; margin: 0 0 16px 0;">Recommended Implementation Roadmap (${useCases.length} use cases)</h2>
          ${roadmapHtml || `<p style="color: #6b7280;">No specific recommendations were generated. Manual review recommended.</p>`}
        </div>

        <div style="background: #f9fafb; padding: 16px 32px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">SAP BTP Use Case Recommendation Platform</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
