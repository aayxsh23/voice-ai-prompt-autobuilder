import React from 'react';
import { Card, Button, Input, Badge } from '../ui';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
  projectId: string;
  variables: any[];
  onRefresh: () => void;
}

export const DynamicVariablesTable: React.FC<Props> = ({ projectId, variables, onRefresh }) => {
  const [newKey, setNewKey] = React.useState('');
  const [newLabel, setNewLabel] = React.useState('');
  const [newVal, setNewVal] = React.useState('');

  const handleAdd = async () => {
    if (!newKey) return;
    await fetch(`/api/projects/${projectId}/variables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newKey, label: newLabel || newKey, defaultValue: newVal, source: 'static' })
    });
    setNewKey(''); setNewLabel(''); setNewVal('');
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/variables/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between border-b border-[#23252a] pb-3">
        <div>
          <h3 className="font-medium text-[#f7f8f8] text-[14px]">Dynamic Variables</h3>
          <p className="text-[11px] text-[#62666d]">Inject runtime caller parameters or CRM tokens into prompt strings.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-[#0f1011] p-3 rounded-[6px] border border-[#23252a]">
        <Input placeholder="key" value={newKey} onChange={e => setNewKey(e.target.value)} className="h-8 text-[11px] font-mono" />
        <Input placeholder="label" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="h-8 text-[11px]" />
        <Input placeholder="default" value={newVal} onChange={e => setNewVal(e.target.value)} className="h-8 text-[11px]" />
        <Button size="sm" onClick={handleAdd} className="h-8 text-[11px]"><Plus className="h-3 w-3 mr-1" /> Add</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-[#23252a] bg-[#0f1011] text-[10px] uppercase font-mono text-[#62666d]">
              <th className="p-2.5">Key</th>
              <th className="p-2.5">Label</th>
              <th className="p-2.5">Source</th>
              <th className="p-2.5">Default</th>
              <th className="p-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#23252a]">
            {variables.map(v => (
              <tr key={v.id} className="hover:bg-[#0f1011]">
                <td className="p-2.5 font-mono font-medium text-[#e4f222]">{`{{${v.key}}}`}</td>
                <td className="p-2.5 text-[#d0d6e0]">{v.label}</td>
                <td className="p-2.5"><Badge variant="outline" className="text-[10px] font-mono">{v.source}</Badge></td>
                <td className="p-2.5 text-[#62666d]">{v.defaultValue || "—"}</td>
                <td className="p-2.5 text-right">
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(v.id)} className="h-7 w-7 p-0 text-[#62666d] hover:text-[#eb5757]">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
