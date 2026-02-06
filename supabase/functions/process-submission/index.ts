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
  scope: string | null;
  timeline: string | null;
  price: string | null;
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

    // 2. Fetch all responses for this submission
    const { data: responses, error: respErr } = await supabase
      .from("responses")
      .select("question_id, answer")
      .eq("submission_id", submission_id);

    if (respErr || !responses) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch responses" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // 4. Get top 5 use cases sorted by score
    const sortedEntries = Object.entries(useCaseScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const sortedIds = sortedEntries.map(([id]) => id);

    let recommendedUseCases: UseCase[] = [];

    if (sortedIds.length > 0) {
      const { data: topUseCases } = await supabase
        .from("use_cases")
        .select("*")
        .in("id", sortedIds);

      if (topUseCases) {
        recommendedUseCases = sortedIds
          .map((id) => topUseCases.find((uc: UseCase) => uc.id === id))
          .filter((uc): uc is UseCase => uc !== undefined);
      }
    }

    // 5. Send email via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const adminEmail = Deno.env.get("ADMIN_EMAIL_ADDRESS");

    if (resendApiKey && adminEmail) {
      const emailHtml = buildEmailHtml(submission, recommendedUseCases);

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

    // 6. Return recommendations
    return new Response(
      JSON.stringify({
        success: true,
        recommended_use_cases: recommendedUseCases,
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

// deno-lint-ignore no-explicit-any
function buildEmailHtml(submission: any, useCases: UseCase[]): string {
  const useCaseRows = useCases
    .map(
      (uc, i) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: #2563eb;">${i + 1}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          <strong>${uc.title}</strong><br/>
          <span style="color: #6b7280; font-size: 13px;">${uc.scope || ""}</span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          <span style="background: #eff6ff; color: #2563eb; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${uc.category}</span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 13px;">${uc.timeline || "—"}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 13px;">${uc.price || "—"}</td>
      </tr>`
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
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${submission.job_title || "—"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; font-weight: 600; border: 1px solid #e5e7eb;">Country</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${submission.country || "—"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f9fafb; font-weight: 600; border: 1px solid #e5e7eb;">Submitted</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${new Date(submission.created_at).toLocaleString()}</td>
            </tr>
          </table>

          <h2 style="color: #111827; font-size: 16px; margin: 0 0 16px 0;">Recommended Use Cases</h2>
          ${
            useCases.length > 0
              ? `
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 10px; border-bottom: 2px solid #e5e7eb; text-align: center; width: 40px;">#</th>
                <th style="padding: 10px; border-bottom: 2px solid #e5e7eb; text-align: left;">Use Case</th>
                <th style="padding: 10px; border-bottom: 2px solid #e5e7eb; text-align: center;">Category</th>
                <th style="padding: 10px; border-bottom: 2px solid #e5e7eb; text-align: center;">Timeline</th>
                <th style="padding: 10px; border-bottom: 2px solid #e5e7eb; text-align: center;">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              ${useCaseRows}
            </tbody>
          </table>`
              : `<p style="color: #6b7280;">No specific recommendations were generated. Manual review recommended.</p>`
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
