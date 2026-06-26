import React from 'react';
import { Card, Button, Input, Badge } from '../ui';
import { Plus, Trash2, Terminal } from 'lucide-react';

interface Props {
  projectId: string;
  functions: any[];
  onRefresh: () => void;
}

export const SuggestedFunctionsPanel: React.FC<Props> = ({ projectId, functions, onRefresh }) => {
  const [name, setName] = React.useState('');
  const [desc, setDesc] = React.useState('');

  const handleAdd = async () => {
    if (!name) return;
    await fetch(`/api/projects/${projectId}/functions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, category: 'Custom Tool' })
    });
    setName(''); setDesc('');
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/functions/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <Card className="space-y-4">
      <div className="border-b border-[#23252a] pb-3">
        <h3 className="font-medium text-[#f7f8f8] text-[14px]">Suggested Functions</h3>
        <p className="text-[11px] text-[#62666d]">Prompt specifications for how the agent should verbalize tools.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-[#0f1011] p-3 rounded-[6px] border border-[#23252a]">
        <Input placeholder="function_name" value={name} onChange={e => setName(e.target.value)} className="h-8 text-[11px] font-mono" />
        <Input placeholder="Purpose" value={desc} onChange={e => setDesc(e.target.value)} className="h-8 text-[11px]" />
        <Button size="sm" onClick={handleAdd} className="h-8 text-[11px]"><Plus className="h-3 w-3 mr-1" /> Add</Button>
      </div>

      <div className="space-y-2">
        {functions.map(f => (
          <div key={f.id} className="p-3 bg-[#0f1011] rounded-[6px] border border-[#23252a] flex items-start justify-between text-[12px]">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Terminal className="h-3 w-3 text-[#62666d]" />
                <span className="font-mono font-medium text-[#d0d6e0]">{f.name}()</span>
                <Badge variant="outline" className="text-[10px] font-mono">{f.category}</Badge>
              </div>
              <p className="text-[#62666d] text-[11px] pl-5">{f.description || f.purposeInPrompt || "Tool specification."}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(f.id)} className="h-7 w-7 p-0 text-[#62666d] hover:text-[#eb5757]">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
};
