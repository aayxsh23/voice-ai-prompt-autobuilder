// lib/compiler/compilers/ToolCompiler.ts

import { geminiClient } from "@/lib/llm/geminiProvider";
import { VoiceAgentIR } from "../ir/IntermediateRepresentation";

export class ToolCompiler {
  async compile(ir: VoiceAgentIR): Promise<string> {
    const tools = ir.tools || [];
    if (tools.length === 0) {
      return "### TECHNICAL TOOL VERBALIZATION RULES\n- No external function execution tools declared.";
    }

    return await geminiClient.generate({
      systemInstruction: `You are a Technical Tool Verbalization Compiler for voice agents.
Normalize technical JSON function schemas and parameter binding rules into explicit runtime behavioral rules.
Specify whether function execution happens silently or requires spoken transition phrases before calling.`,
      prompt: `Normalize the following technical tool schemas into spoken runtime rules:
${JSON.stringify(tools, null, 2)}`
    }).then(res => res.text);
  }
}
