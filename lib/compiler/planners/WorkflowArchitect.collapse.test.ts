import { describe, it, expect, vi, afterEach } from 'vitest';
import { WorkflowArchitect } from './WorkflowArchitect';
import * as qwen from '@/lib/llm/qwenProvider';

/**
 * Drive planWorkflow through its LLM-generation path so post-processing (including
 * the handler-state collapse Fix A introduces) runs. We plant the "LLM response"
 * via a mock and read the post-processed nodes back out.
 *
 * `spec.callFlowPlan.fsmStates` is deliberately absent — planWorkflow's early
 * bypass at [167-168] returns raw states without post-processing when that field
 * is set, which would skip the collapser we're testing.
 */
async function runPlannerWith(fakeStates: any[]): Promise<any[]> {
  vi.spyOn(qwen.llmClient, 'generate').mockResolvedValue({ text: JSON.stringify(fakeStates) });
  const spec: any = {
    meta: { companyName: 'X', agentName: 'Y', primaryGoal: 'test', languageMode: 'english', region: 'US' },
    businessSnapshot: {}, callFlowPlan: {}, tools: [], dynamicVariables: [],
  };
  return await WorkflowArchitect.planWorkflow(spec);
}

afterEach(() => vi.restoreAllMocks());

const stub = (id: string, edges: Array<{ condition: string; targetStateId: string }>) => ({
  id, objective: id, edges,
});

const withSlots = (id: string, slots: string[], edges: Array<{ condition: string; targetStateId: string }>) => ({
  id, objective: id, slotsToCollect: slots, edges,
});

describe('handler-state collapse (Fix A)', () => {
  it('removes an all-terminal handler stub and rewrites inbound edges to acknowledge_and_close/end_call', async () => {
    const nodes = await runPlannerWith([
      withSlots('opening', [], [
        { condition: 'not interested', targetStateId: 'not_interested_handler' },
        { condition: 'ok', targetStateId: 'collect' },
      ]),
      stub('not_interested_handler', [{ condition: 'always', targetStateId: 'end_call' }]),
      withSlots('collect', ['name'], [{ condition: 'done', targetStateId: 'end_call' }]),
      { id: 'end_call', objective: 'end', terminal: true, edges: [] },
    ]);
    const ids = nodes.map(n => n.id);
    expect(ids).not.toContain('not_interested_handler');
    const opening = nodes.find(n => n.id === 'opening')!;
    const rewritten = opening.edges.find((e: any) => e.condition === 'not interested');
    expect(rewritten.targetStateId).toBe('end_call');
    expect(rewritten.action).toBe('acknowledge_and_close');
  });

  it('collapses a rephrase-and-return handler into an action verb pointing at the parent', async () => {
    const nodes = await runPlannerWith([
      withSlots('pitch', [], [
        { condition: 'confused', targetStateId: 'confused_rephrase' },
        { condition: 'yes', targetStateId: 'end_call' },
      ]),
      stub('confused_rephrase', [{ condition: 'understands', targetStateId: 'pitch' }]),
      { id: 'end_call', objective: 'end', terminal: true, edges: [] },
    ]);
    const ids = nodes.map(n => n.id);
    expect(ids).not.toContain('confused_rephrase');
    const pitch = nodes.find(n => n.id === 'pitch')!;
    const rewritten = pitch.edges.find((e: any) => e.condition === 'confused');
    expect(rewritten.targetStateId).toBe('pitch');
    expect(rewritten.action).toBe('rephrase_and_return');
  });

  it('leaves a state that collects slots UNTOUCHED even if referenced as a handler target', async () => {
    const nodes = await runPlannerWith([
      withSlots('opening', [], [{ condition: 'ok', targetStateId: 'collect' }]),
      withSlots('collect', ['x'], [{ condition: 'done', targetStateId: 'end_call' }]),
      { id: 'end_call', objective: 'end', terminal: true, edges: [] },
    ]);
    expect(nodes.map(n => n.id)).toContain('collect');
  });

  it('does not remove the canonical end_call terminal itself', async () => {
    const nodes = await runPlannerWith([
      withSlots('a', ['x'], [{ condition: 'done', targetStateId: 'end_call' }]),
      { id: 'end_call', objective: 'end', terminal: true, edges: [] },
    ]);
    expect(nodes.map(n => n.id)).toContain('end_call');
  });

  it('collapses the full VLCC pattern from ~14 states down to the business-state core', async () => {
    // Reproduces the shape of the shipped VLCC flow: 7 handler stubs the LLM
    // emitted per-emotion. All should collapse; the 5 business states + end_call
    // remain (opening, context_reminder, pitch, offer, collect, close/end_call).
    const objections = ['not_interested_handler', 'already_have_handler', 'why_calling_handler', 'upset_handler'];
    const rephrases = ['confused_rephrase', 'confused_still'];
    const withObjections = (id: string) => [
      { condition: 'ok', targetStateId: 'context_reminder' },
      ...objections.map(h => ({ condition: h.replace('_handler', ''), targetStateId: h })),
      ...rephrases.map(h => ({ condition: h.replace('confused_', 'confused_'), targetStateId: h })),
    ];
    const nodes = await runPlannerWith([
      withSlots('opening', [], withObjections('opening')),
      withSlots('context_reminder', [], [{ condition: 'ok', targetStateId: 'pitch' }]),
      withSlots('pitch', [], [{ condition: 'yes', targetStateId: 'collect' }]),
      withSlots('collect', ['a', 'b'], [{ condition: 'done', targetStateId: 'end_call' }]),
      // handler stubs
      ...objections.map(id => stub(id, [{ condition: 'always', targetStateId: 'end_call' }])),
      stub('confused_rephrase', [{ condition: 'still', targetStateId: 'confused_still' }]),
      stub('confused_still', [{ condition: 'always', targetStateId: 'end_call' }]),
      { id: 'end_call', objective: 'end', terminal: true, edges: [] },
    ]);
    const ids = new Set(nodes.map(n => n.id));
    for (const h of objections) expect(ids.has(h), h + ' should be collapsed').toBe(false);
    for (const h of rephrases) expect(ids.has(h), h + ' should be collapsed').toBe(false);
    expect(ids.has('opening')).toBe(true);
    expect(ids.has('collect')).toBe(true);
    expect(ids.has('end_call')).toBe(true);
    // Went from 11 states to ~5 business states + end_call.
    expect(nodes.length).toBeLessThanOrEqual(6);
  });
});
