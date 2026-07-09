import { CoverageArchitect } from "../lib/compiler/blueprint/CoverageArchitect";
import { WorkflowArchitect } from "../lib/compiler/planners/WorkflowArchitect";
import { validateFlowCompleteness } from "../lib/pipeline/validators/FlowCompletenessValidator";
import { PromptAssembler } from "../lib/compiler/assembler/PromptAssembler";
import { BusinessSpecification } from "../lib/llm/types";

async function runVerification() {
  console.log("=== 1. VERIFYING COVERAGE ARCHITECT CHECKPOINTS 14-27 ===");
  const testSpec: BusinessSpecification = {
    meta: {
      companyName: "Acme Healthcare",
      agentName: "Clara",
      primaryGoal: "Book patient appointments",
      industry: "Healthcare",
      languageMode: "english",
      isRegulated: true,
      toneProfile: ["Professional"]
    },
    businessSnapshot: {
      operatingHours: "9am - 5pm",
      servicesOffered: ["Checkup", "X-Ray"],
      policies: { cancellation: "24 hours", refunds: "No refund", escalationNumbers: ["555-0199"] }
    },
    callFlowPlan: { steps: [] },
    knowledgeBase: { faqs: [], objections: [] },
    tools: []
  };

  const evalResult = CoverageArchitect.evaluate(testSpec, []);
  console.log(`Total missing fields identified: ${evalResult.missingFields.length}`);
  const hasCallFlowCheckpoints = evalResult.missingFields.some(f =>
    f.includes("Call Flow Skeleton") ||
    f.includes("No-Input / Silence Handling") ||
    f.includes("Interruption / Barge-in Behavior") ||
    f.includes("Mid-Flow Digression Handling") ||
    f.includes("Retry Exhaustion Fallback") ||
    f.includes("Confirmation & Read-back Style") ||
    f.includes("DTMF / Keypad Input Fallback") ||
    f.includes("Entry Routing & Multi-Request Branching")
  );
  console.log(`Includes Call Flow Checkpoints (14-27): ${hasCallFlowCheckpoints ? "PASSED" : "FAILED"}`);

  console.log("\n=== 2. VERIFYING WORKFLOW ARCHITECT USER-DEFINED STEPS & POLICIES ===");
  const specWithCustomFlow: Partial<BusinessSpecification> = {
    ...testSpec,
    callFlowPlan: {
      steps: [],
      userDefinedSteps: [
        {
          stateId: "identity_gate",
          stateName: "Identity Verification",
          objective: "Greet caller and verify identity",
          scriptDirective: 'Say: "Hello from Acme Healthcare. Am I speaking with {{caller_name}}?"',
          slotsToCollect: [],
          branchingConditions: [{ condition: "Confirmed", goToStep: 2 }, { condition: "Busy", goToStep: "end_call", reason: "busy" }],
          fallbackBehavior: 'Say: "Could you confirm your name?"',
          maxRetries: 3,
          onFailure: { afterRetries: 3, action: "Transfer", target: "reception", fallbackLine: "Transferring you now." }
        },
        {
          stateId: "capture_dob",
          stateName: "Capture DOB",
          objective: "Collect patient date of birth",
          scriptDirective: 'Say: "Please state your date of birth."',
          slotsToCollect: ["patient_dob"],
          branchingConditions: [{ condition: "DOB provided", goToStep: 3 }],
          fallbackBehavior: 'Say: "Could you repeat your birth date?"',
          maxRetries: 3,
          confirmationRequired: true,
          digressionAllowed: false
        },
        {
          stateId: "resolution",
          stateName: "Final Closing",
          objective: "End call cleanly",
          scriptDirective: 'Say: "Thank you, goodbye!"',
          slotsToCollect: [],
          branchingConditions: [{ condition: "Done", goToStep: "end_call", reason: "completed" }],
          isTerminal: true
        }
      ]
    }
  };

  const plannedSteps = await WorkflowArchitect.planWorkflow(specWithCustomFlow);
  console.log(`Planned steps count: ${plannedSteps.length}`);
  const preservedOnFailure = plannedSteps[0]?.onFailure?.action === "Transfer";
  const preservedConfirmation = plannedSteps[1]?.confirmationRequired === true;
  const preservedDigression = plannedSteps[1]?.digressionAllowed === false;
  console.log(`Preserves onFailure flag: ${preservedOnFailure ? "PASSED" : "FAILED"}`);
  console.log(`Preserves confirmationRequired flag: ${preservedConfirmation ? "PASSED" : "FAILED"}`);
  console.log(`Preserves digressionAllowed flag: ${preservedDigression ? "PASSED" : "FAILED"}`);

  console.log("\n=== 3. VERIFYING FLOW COMPLETENESS VALIDATOR ===");
  const validCheck = validateFlowCompleteness(specWithCustomFlow as any, plannedSteps);
  console.log(`Flow completeness on valid custom flow: ${validCheck.isValid ? "PASSED (No errors)" : "FAILED: " + validCheck.errors.join("; ")}`);

  const incompleteSteps = [
    {
      stateId: "step_1",
      stateName: "Ask Name",
      slotsToCollect: ["caller_name"],
      scriptDirective: "What is your name?"
      // Missing fallbackBehavior, maxRetries, and no terminal step!
    }
  ];
  const invalidCheck = validateFlowCompleteness(specWithCustomFlow as any, incompleteSteps);
  console.log(`Flow completeness on incomplete flow: ${!invalidCheck.isValid ? "PASSED (Correctly detected errors: " + invalidCheck.errors.length + ")" : "FAILED"}`);

  console.log("\n=== 4. VERIFYING PROMPT ASSEMBLER WITH CALL FLOW POLICIES ===");
  const assembler = new PromptAssembler();
  const specWithPolicies: BusinessSpecification = {
    ...testSpec,
    callFlowPlan: {
      steps: plannedSteps,
      interruptionPolicy: "Allow immediate interruption when caller speaks.",
      digressionPolicy: "Answer FAQ briefly then return to slot capture.",
      silenceHandling: { timeoutSeconds: 6, action: "Reprompt politely", maxReprompts: 2 }
    }
  };
  console.log("plannedSteps[1]:", JSON.stringify(plannedSteps[1], null, 2));
  const prompt = assembler.assemble(specWithPolicies);
  const hasPoliciesHeader = prompt.includes("CONVERSATIONAL & CALL FLOW POLICIES");
  const hasStepOnFailure = prompt.includes("Exhaustion / Failure Behavior:");
  const hasStepConfirmationRule = prompt.includes("Confirmation Rule:");
  console.log("Prompt includes CALL FLOW POLICIES header:", hasPoliciesHeader ? "PASSED" : "FAILED");
  console.log("Prompt renders step onFailure behavior:", hasStepOnFailure ? "PASSED" : "FAILED");
  console.log("Prompt renders step confirmation rule:", hasStepConfirmationRule ? "PASSED" : "FAILED");
  if (!hasStepConfirmationRule) {
    const idx = prompt.indexOf("capture_dob");
    console.log("Prompt around capture_dob:\n", prompt.slice(idx, idx + 1200));
  }

  if (hasCallFlowCheckpoints && preservedOnFailure && preservedConfirmation && validCheck.isValid && !invalidCheck.isValid && hasPoliciesHeader && hasStepOnFailure) {
    console.log("\n>>> ALL ROADMAP OBJECTIVES SUCCESSFULLY VERIFIED! <<<");
  } else {
    console.error("\n>>> VERIFICATION FAILED SOME CHECKS <<<");
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error("Verification script crashed:", err);
  process.exit(1);
});
