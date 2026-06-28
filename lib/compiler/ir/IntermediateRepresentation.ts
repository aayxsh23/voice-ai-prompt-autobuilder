// lib/compiler/ir/IntermediateRepresentation.ts

export interface VoiceAgentIR {
  identity?: { name?: string; role?: string };
  mission?: { goal?: string };
  meta: {
    agentName: string;
    companyName: string;
    role: string;
    toneProfile: string[];
    contextScope: string;
    languageVariant?: string;
  };
  context: {
    key: string; // e.g. "Customer_Name" or "Truck_Number"
    label: string;
    description: string;
    source: "crm" | "db" | "runtime" | string;
    defaultValue?: string;
  }[];
  states: {
    sequenceOrder: number;
    stateId: string;
    stateName: string;
    explicitDialogueScript: string; // The literal phrase to hardcode
    slotsToCollect: string[];
    fallbackBehavior: string;
  }[];
  slots: {
    name: string;
    type: "string" | "number" | "date" | "email";
    ttsNormalizationRule: string; // e.g. "speak digit by digit"
    isRequired: boolean;
  }[];
  tools: {
    functionName: string;
    description: string;
    parameters: Record<string, any>;
    bindingStateId: string;
  }[];
}
