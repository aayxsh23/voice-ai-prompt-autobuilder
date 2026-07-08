import React from 'react';
import { Card, Button, Input, Badge } from '../ui';
import { Plus, Trash2, ArrowRightLeft } from 'lucide-react';

interface Props {
  projectId: string;
  variables: any[];
  onRefresh: () => void;
}

export const DynamicVariablesTable: React.FC<Props> = ({ projectId, variables, onRefresh }) => {
  const [newKey, setNewKey] = React.useState('');
  const [newLabel, setNewLabel] = React.useState('');
  const [newVal, setNewVal] = React.useState('');
  const [newDirection, setNewDirection] = React.useState<'infield' | 'outfield'>('infield');

  const handleAdd = async () => {
    if (!newKey) return;
    await fetch(`/api/projects/${projectId}/variables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: newKey,
        label: newLabel || newKey,
        defaultValue: newVal,
        source: newDirection === 'infield' ? 'static' : 'extraction',
        fieldDirection: newDirection
      })
    });
    setNewKey(''); setNewLabel(''); setNewVal('');
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/variables/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleToggleDirection = async (id: string, current: string) => {
    const next = current === 'outfield' ? 'infield' : 'outfield';
    await fetch(`/api/variables/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fieldDirection: next,
        source: next === 'infield' ? 'static' : 'extraction'
      })
    });
    onRefresh();
  };

  const infields = variables.filter(v => v.fieldDirection !== 'outfield');
  const outfields = variables.filter(v => v.fieldDirection === 'outfield');

  const renderTable = (list: any[], direction: 'infield' | 'outfield') => (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[#23252a] bg-[#0f1011] text-[10px] uppercase font-mono text-[#62666d]">
            <th className="p-2.5">Key Syntax</th>
            <th className="p-2.5">Label</th>
            <th className="p-2.5">Source</th>
            <th className="p-2.5">Default / Notes</th>
            <th className="p-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#23252a]">
          {list.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-4 text-center text-[#62666d] text-[11px] italic">
                No {direction === 'infield' ? 'infields' : 'outfields'} defined.
              </td>
            </tr>
          ) : (
            list.map(v => (
              <tr key={v.id} className="hover:bg-[#0f1011]">
                <td className="p-2.5 font-mono font-medium text-[#e4f222]">
                  {direction === 'infield' ? `{{${v.key}}}` : `[${v.key}]`}
                </td>
                <td className="p-2.5 text-[#d0d6e0]">{v.label}</td>
                <td className="p-2.5"><Badge variant="outline" className="text-[10px] font-mono">{v.source || (direction === 'infield' ? 'static' : 'extraction')}</Badge></td>
                <td className="p-2.5 text-[#62666d]">{v.defaultValue || "—"}</td>
                <td className="p-2.5 text-right flex items-center justify-end space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleDirection(v.id, v.fieldDirection || 'infield')}
                    title={`Move to ${direction === 'infield' ? 'Outfields' : 'Infields'}`}
                    className="h-7 px-2 text-[10px] text-[#62666d] hover:text-[#f7f8f8] flex items-center space-x-1"
                  >
                    <ArrowRightLeft className="h-3 w-3 mr-1" />
                    <span>{direction === 'infield' ? 'To Outfield' : 'To Infield'}</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(v.id)} className="h-7 w-7 p-0 text-[#62666d] hover:text-[#eb5757]">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <Card className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#23252a] pb-3">
        <div>
          <h3 className="font-medium text-[#f7f8f8] text-[14px]">Dynamic Variables & Extractions</h3>
          <p className="text-[11px] text-[#62666d]">Separate pre-call context (Infields) from post-call transcript extractions (Outfields).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 bg-[#0f1011] p-3 rounded-[6px] border border-[#23252a]">
        <select
          value={newDirection}
          onChange={e => setNewDirection(e.target.value as any)}
          className="h-8 text-[11px] bg-[#181a1d] border border-[#23252a] text-[#f7f8f8] rounded-[4px] px-2 focus:outline-none focus:border-[#e4f222]"
        >
          <option value="infield">Infield {'{{ }}'}</option>
          <option value="outfield">Outfield {'[ ]'}</option>
        </select>
        <Input placeholder="key_name" value={newKey} onChange={e => setNewKey(e.target.value)} className="h-8 text-[11px] font-mono" />
        <Input placeholder="Label / Description" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="h-8 text-[11px]" />
        <Input placeholder="Default value (optional)" value={newVal} onChange={e => setNewVal(e.target.value)} className="h-8 text-[11px]" />
        <Button size="sm" onClick={handleAdd} className="h-8 text-[11px]"><Plus className="h-3 w-3 mr-1" /> Add Variable</Button>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <span className="text-[12px] font-medium text-[#f7f8f8]">Infields (Pre-Call Context)</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#181a1d] text-[#e4f222] border border-[#23252a]">{'{{variable_name}}'}</span>
          </div>
          <p className="text-[11px] text-[#62666d]">Provided before the call begins. Injected directly into the prompt instruction.</p>
          {renderTable(infields, 'infield')}
        </div>

        <div className="space-y-2 pt-4 border-t border-[#23252a]">
          <div className="flex items-center space-x-2">
            <span className="text-[12px] font-medium text-[#f7f8f8]">Outfields (Post-Call Extractions)</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#181a1d] text-[#38bdf8] border border-[#23252a]">{'[variable_name]'}</span>
          </div>
          <p className="text-[11px] text-[#62666d]">Information collected during the call to be extracted from transcripts by LLM after the call ends.</p>
          {renderTable(outfields, 'outfield')}
        </div>
      </div>
    </Card>
  );
};
