import React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Layers, Terminal, Zap } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export default function HomePage() {
  return (
    <div className="flex-1 py-16 px-6">
      <div className="max-w-5xl mx-auto space-y-20 text-center">
        
        {/* Hero Section */}
        <div className="space-y-6 max-w-4xl mx-auto pt-12">
          <h1 className="text-5xl sm:text-[64px] font-light text-[#f7f8f8] tracking-[-0.96px] leading-[1.13]">
            Build, Audit & Simulate{' '}
            <br className="hidden sm:block" />
            Human-Grade Voice Prompts
          </h1>

          <p className="text-[17px] text-[#8a8f98] max-w-2xl mx-auto leading-[1.6]">
            Eliminate robotic telephony filler and hallucinations. Generate structured Agent Blueprints, verify verbal readback rules, and test against aggressive caller personas.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Link href="/builder">
              <Button size="lg" className="w-full sm:w-auto font-medium px-8 h-12 text-[15px]">
                Start Prompt Wizard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="w-full sm:w-auto px-8 h-12 text-[15px] rounded-full border-[#f7f8f8]/20 text-[#f7f8f8] hover:bg-[#f7f8f8]/5">
                Browse Projects
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-[#5e6ad2]" />
              <span className="text-[11px] uppercase font-medium text-[#62666d] tracking-wide">Templates</span>
            </div>
            <h3 className="text-[15px] font-medium text-[#f7f8f8] mb-2">15 Starter Architectures</h3>
            <p className="text-[13px] text-[#62666d] leading-relaxed">
              Pre-built slot collection handlers for Clinic Receptionists, Real Estate Showings, Restaurant Maître D's, and SaaS SDRs.
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-[#27a644]" />
              <span className="text-[11px] uppercase font-medium text-[#62666d] tracking-wide">Auditing</span>
            </div>
            <h3 className="text-[15px] font-medium text-[#f7f8f8] mb-2">Smart Gap Auditor</h3>
            <p className="text-[13px] text-[#62666d] leading-relaxed">
              Automated heuristics scan your blueprint for missing operating hours, verbal readback rules, and emergency safety halts.
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-[#02b8cc]" />
              <span className="text-[11px] uppercase font-medium text-[#62666d] tracking-wide">Testing</span>
            </div>
            <h3 className="text-[15px] font-medium text-[#f7f8f8] mb-2">Voice Turn Simulator</h3>
            <p className="text-[13px] text-[#62666d] leading-relaxed">
              Real-time sandbox testing how your prompt handles impatient interruptions, out-of-scope requests, and acute caller anger.
            </p>
          </Card>
        </div>

        {/* Notice Box */}
        <div className="max-w-3xl mx-auto p-5 rounded-[12px] bg-[#0f1011] text-left border border-[#23252a] flex items-start space-x-4">
          <Zap className="h-5 w-5 text-[#8a8f98] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-medium text-[#d0d6e0] text-[13px]">Pure Prompt Architecture Engine</h4>
            <p className="text-[12px] text-[#62666d] leading-relaxed">
              This product builds high-reliability prompt packages — Agent Prompt, System Prompt, Variables, Tool Schemas. Ready to export to Retell, Vapi, LiveKit, or bespoke audio pipelines.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
