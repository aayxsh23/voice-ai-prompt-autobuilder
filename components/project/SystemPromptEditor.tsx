import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Input } from '../ui';
import { Save, Plus } from 'lucide-react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ----------------------------------------------------
// Custom Node Component
// ----------------------------------------------------
const FsmStateNode = ({ data }: any) => {
  const { id, objective, entryAction, inTurnTool, isTerminal } = data;
  return (
    <div className={`p-4 bg-[#1e2025] border-2 ${isTerminal ? 'border-red-500/50' : 'border-[#383b42]'} rounded-xl min-w-[250px] text-white shadow-xl`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-blue-500" />
      <div className="font-bold text-sm mb-1">{id}</div>
      <div className="text-xs text-slate-400 mb-3">{objective}</div>
      
      {entryAction && (
        <div className="mb-2 p-2 bg-[#121315] rounded text-xs">
          <span className="text-blue-400 font-bold">Entry:</span> {entryAction.tool}
        </div>
      )}
      
      {inTurnTool && (
        <div className="mb-2 p-2 bg-[#121315] rounded text-xs">
          <span className="text-purple-400 font-bold">In-Turn:</span> {inTurnTool.tool}
        </div>
      )}
      
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-blue-500" />
    </div>
  );
};

const nodeTypes = {
  fsmNode: FsmStateNode
};

// ----------------------------------------------------
// Main Editor Component
// ----------------------------------------------------
interface Props {
  project: any;
  onUpdate: (key: string, val: any) => Promise<void>;
  onSave: () => Promise<void>;
  saving?: boolean;
}

export const SystemPromptEditor: React.FC<Props> = ({ project, onUpdate, onSave, saving }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [selectedState, setSelectedState] = useState<any>(null);

  // Initialize from blueprintJson
  useEffect(() => {
    if (!project?.blueprintJson?.business?.callFlowPlan?.fsmStates) return;
    const fsmStates = project.blueprintJson.business.callFlowPlan.fsmStates;
    
    // Layout logic: simple grid layout
    const newNodes = fsmStates.map((state: any, index: number) => ({
      id: state.id,
      type: 'fsmNode',
      position: { x: 250, y: index * 200 + 50 },
      data: state,
    }));

    const newEdges: any[] = [];
    fsmStates.forEach((state: any) => {
      (state.transitions || []).forEach((t: any, i: number) => {
        if (t.nextState) {
          newEdges.push({
            id: `e-${state.id}-${t.nextState}-${i}`,
            source: state.id,
            target: t.nextState,
            label: t.condition,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#4b5563' },
            labelStyle: { fill: '#9ca3af', fontSize: 10 }
          });
        }
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [project?.blueprintJson?.business?.callFlowPlan?.fsmStates, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges],
  );

  const onNodeClick = (_event: React.MouseEvent, node: any) => {
    setSelectedState(node.data);
  };

  const handleUpdateState = (updatedState: any) => {
    const fsmStates = project?.blueprintJson?.business?.callFlowPlan?.fsmStates || [];
    const newFsmStates = fsmStates.map((s: any) => s.id === updatedState.id ? updatedState : s);
    
    const newBlueprint = {
      ...project.blueprintJson,
      business: {
        ...project.blueprintJson.business,
        callFlowPlan: {
          ...project.blueprintJson.business.callFlowPlan,
          fsmStates: newFsmStates
        }
      }
    };
    
    onUpdate('blueprintJson', newBlueprint);
    setSelectedState(updatedState);
  };

  const addState = () => {
    const fsmStates = project?.blueprintJson?.business?.callFlowPlan?.fsmStates || [];
    const newState = {
      id: `New_State_${fsmStates.length + 1}`,
      objective: "New state objective",
      transitions: []
    };
    const newFsmStates = [...fsmStates, newState];
    const newBlueprint = {
      ...project.blueprintJson,
      business: {
        ...project.blueprintJson.business,
        callFlowPlan: {
          ...project.blueprintJson.business.callFlowPlan,
          fsmStates: newFsmStates
        }
      }
    };
    onUpdate('blueprintJson', newBlueprint);
  };

  return (
    <Card className="p-0 overflow-hidden flex flex-col h-full bg-[#08090a]">
      <div className="bg-[#0f1011] px-4 py-2.5 flex items-center justify-between border-b border-[#23252a] shrink-0">
        <span className="font-mono text-[12px] text-[#8a8f98]">Call Flow FSM Editor (Visual)</span>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={addState} className="h-7 text-[11px]">
            <Plus className="h-3 w-3 mr-1" /> Add State
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving} className="h-7 text-[11px]">
            <Save className="h-3 w-3 mr-1" />
            {saving ? "Saving..." : "Save Flow"}
          </Button>
        </div>
      </div>
      
      <div className="flex-1 flex flex-row relative h-[700px]">
        {/* Node Graph */}
        <div className="flex-1 h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-[#08090a]"
            colorMode="dark"
          >
            <Controls />
            <MiniMap />
            <Background gap={12} size={1} />
          </ReactFlow>
        </div>

        {/* Side Panel for Node Config */}
        {selectedState && (
          <div className="w-[350px] h-full bg-[#121315] border-l border-[#23252a] p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-sm">State Configuration</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedState(null)} className="h-6 px-2 text-xs">Close</Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">State ID</label>
                <Input 
                  value={selectedState.id}
                  onChange={e => handleUpdateState({ ...selectedState, id: e.target.value })}
                  className="bg-[#1a1c21] border-[#383b42] text-sm text-white"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Objective</label>
                <textarea 
                  value={selectedState.objective}
                  onChange={e => handleUpdateState({ ...selectedState, objective: e.target.value })}
                  className="w-full h-24 bg-[#1a1c21] border border-[#383b42] rounded-md p-2 text-sm text-white resize-none"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Required Extractions (Comma separated)</label>
                <Input 
                  value={(selectedState.slotsToCollect || []).join(', ')}
                  onChange={e => handleUpdateState({ ...selectedState, slotsToCollect: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  className="bg-[#1a1c21] border-[#383b42] text-sm text-white"
                  placeholder="e.g. phone_number, customer_name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Entry Action Tool</label>
                <Input 
                  value={selectedState.entryAction?.tool || ''}
                  onChange={e => handleUpdateState({ 
                    ...selectedState, 
                    entryAction: { ...selectedState.entryAction, tool: e.target.value }
                  })}
                  placeholder="e.g. set_capture_mode"
                  className="bg-[#1a1c21] border-[#383b42] text-sm text-white mb-2"
                />
                <label className="block text-xs font-medium text-slate-400 mb-1">Entry Speech Prompt</label>
                <textarea 
                  value={selectedState.entryAction?.speechPrompt || ''}
                  onChange={e => handleUpdateState({ 
                    ...selectedState, 
                    entryAction: { ...selectedState.entryAction, speechPrompt: e.target.value }
                  })}
                  className="w-full h-16 bg-[#1a1c21] border border-[#383b42] rounded-md p-2 text-sm text-white resize-none"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-300 mt-4 mb-2">Transitions</label>
                {(selectedState.transitions || []).map((t: any, i: number) => (
                  <div key={i} className="mb-3 p-3 bg-[#1a1c21] rounded-lg border border-[#383b42]">
                    <div className="text-[10px] uppercase text-slate-500 font-bold mb-2">Condition {i + 1}</div>
                    <Input 
                      value={t.condition}
                      placeholder="e.g. input == 'yes'"
                      onChange={e => {
                        const newT = [...selectedState.transitions];
                        newT[i].condition = e.target.value;
                        handleUpdateState({ ...selectedState, transitions: newT });
                      }}
                      className="bg-[#24262b] border-none text-xs text-white mb-2"
                    />
                    <Input 
                      value={t.nextState || ''}
                      placeholder="Next State ID"
                      onChange={e => {
                        const newT = [...selectedState.transitions];
                        newT[i].nextState = e.target.value;
                        handleUpdateState({ ...selectedState, transitions: newT });
                      }}
                      className="bg-[#24262b] border-none text-xs text-white"
                    />
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const newT = [...(selectedState.transitions || []), { condition: 'true', nextState: '' }];
                    handleUpdateState({ ...selectedState, transitions: newT });
                  }} 
                  className="w-full h-7 text-[11px] mt-2"
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Transition
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
