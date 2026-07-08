import { BusinessSpecification } from "@/lib/llm/types";
import { geminiClient } from "@/lib/llm/geminiProvider";
import { safeParseJson } from "@/lib/llm/types";

export class WorkflowArchitect {
  public static async planWorkflow(spec: Partial<BusinessSpecification>): Promise<BusinessSpecification['callFlowPlan']['steps']> {
    const meta = spec.meta || {} as any;
    const snap = spec.businessSnapshot || {} as any;
    const languageMode = meta.languageMode || (spec as any).languageMode || 'english';
    const capturedText = JSON.stringify(spec.capturedTopics || []) + JSON.stringify(spec.resolvedTopics || []);
    const isHindiOrHinglish = languageMode === 'hindi' || languageMode === 'hinglish' || /hindi|hinglish/i.test(capturedText);

    const fallbackSteps = isHindiOrHinglish ? [
      {
        sequenceOrder: 1,
        stateId: "greeting",
        stateName: "Greeting & Verification",
        scriptDirective: `Say: "नमस्ते, मैं ${meta.companyName || 'company'} से ${meta.agentName || 'दीपिका'} बात कर रही हूँ। क्या मेरी बात business owner से हो रही है?"`,
        slotsToCollect: [],
        isFallback: true
      },
      {
        sequenceOrder: 2,
        stateId: "requirement_collection",
        stateName: "Requirement Collection",
        scriptDirective: `Say: "मैं आपके business operations और software requirements समझने के लिए कॉल कर रही हूँ। क्या आप demo के बारे में और जानना चाहेंगे?"`,
        slotsToCollect: ["caller_intent"],
        isFallback: true
      },
      {
        sequenceOrder: 3,
        stateId: "resolution",
        stateName: "Resolution & Next Steps",
        scriptDirective: `Say: "बहुत बढ़िया। मैं आपका demo schedule कर देती हूँ, आपको जल्द ही confirmation मिल जाएगा।"`,
        slotsToCollect: [],
        isFallback: true
      }
    ] : [
      {
        sequenceOrder: 1,
        stateId: "greeting",
        stateName: "Greeting & Verification",
        scriptDirective: `Say: "Hello, calling from ${meta.companyName || 'our desk'}. How may I assist you today?"`,
        slotsToCollect: [],
        isFallback: true
      },
      {
        sequenceOrder: 2,
        stateId: "requirement_collection",
        stateName: "Requirement Collection",
        scriptDirective: `Say: "May I understand your requirements or schedule a consultation?"`,
        slotsToCollect: ["caller_intent"],
        isFallback: true
      },
      {
        sequenceOrder: 3,
        stateId: "resolution",
        stateName: "Resolution & Next Steps",
        scriptDirective: `Say: "Understood. I will proceed with your request immediately."`,
        slotsToCollect: [],
        isFallback: true
      }
    ];

    const langDirective = isHindiOrHinglish
      ? `\nCRITICAL LANGUAGE DIRECTIVE:\nThis voice agent communicates in Hindi/Hinglish (languageMode '${languageMode}' / operational protocols). EVERY SINGLE scriptDirective across every step MUST be written in Devanagari script (देवनागरी), NOT English/Roman letters. ONLY specific English business/domain terms (like 'Marg ERP', 'business owner', 'online demo', 'software', 'pincode') can be written in English letters. For example: Say: "नमस्ते, मैं ${meta.companyName || 'Marg ERP'} से ${meta.agentName || 'दीपिका'} बात कर रही हूँ। क्या मेरी बात business owner से हो रही है?"\nNEVER generate Hindi sentences using Romanized English script.`
      : "";

    const prompt = `You are a WorkflowArchitect specializing in designing deterministic voice AI call flow state machines.
Given the following business metadata and operating snapshot, output a JSON array of steps for the callFlowPlan.${langDirective}

Business Meta:
${JSON.stringify(meta, null, 2)}

Business Snapshot:
${JSON.stringify(snap, null, 2)}

Operational Protocols & Captured Topics:
${JSON.stringify(spec.capturedTopics || [], null, 2)}

Return a JSON array of objects with:
- sequenceOrder (number starting at 1)
- stateId (lowercase snake_case identifier)
- stateName (human readable state name)
- scriptDirective (exact directive or dialogue instruction using Say: "..." written in the exact target language required)
- slotsToCollect (string array of slot names required in this state)`;

    try {
      const response = await geminiClient.generate({
        systemInstruction: `You are a structured JSON workflow planning specialist. Return ONLY a valid JSON array of steps.${isHindiOrHinglish ? " All Say: dialogue inside scriptDirective MUST be written in Devanagari script (देवनागरी). Only domain/technical terms can remain in English." : ""}`,
        prompt,
        responseMimeType: "application/json"
      });
      const parsed = safeParseJson(response.text, fallbackSteps);
      const steps = Array.isArray(parsed) ? parsed : fallbackSteps;
      return steps.length > 0 ? steps : fallbackSteps;
    } catch (err) {
      console.warn("WorkflowArchitect fallback triggered:", err);
      return fallbackSteps;
    }
  }
}
