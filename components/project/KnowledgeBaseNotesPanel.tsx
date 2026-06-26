import React from 'react';
import { Card, Button, Input, Textarea, Badge } from '../ui';
import { Plus, Trash2, FileText } from 'lucide-react';

interface Props {
  projectId: string;
  notes: any[];
  onRefresh: () => void;
}

export const KnowledgeBaseNotesPanel: React.FC<Props> = ({ projectId, notes, onRefresh }) => {
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');

  const handleAdd = async () => {
    if (!title || !content) return;
    await fetch(`/api/projects/${projectId}/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, category: 'FAQ Note' })
    });
    setTitle(''); setContent('');
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <Card className="space-y-4">
      <div className="border-b border-[#23252a] pb-3">
        <h3 className="font-medium text-[#f7f8f8] text-[14px]">Knowledge Base & FAQ Cards</h3>
        <p className="text-[11px] text-[#62666d]">Verified verbal answers for company policies and common FAQs.</p>
      </div>

      <div className="space-y-2 bg-[#0f1011] p-3 rounded-[6px] border border-[#23252a]">
        <Input placeholder="Note Title" value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-[11px]" />
        <Textarea placeholder="Exact speakable answer..." value={content} onChange={e => setContent(e.target.value)} className="text-[11px] min-h-[60px] font-sans" />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleAdd} className="h-8 text-[11px]"><Plus className="h-3 w-3 mr-1" /> Add Card</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {notes.map(n => (
          <div key={n.id} className="p-3.5 bg-[#0f1011] rounded-[6px] border border-[#23252a] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-[12px] text-[#d0d6e0] flex items-center gap-1.5">
                  <FileText className="h-3 w-3 text-[#62666d]" /> {n.title}
                </span>
                <Badge variant="outline" className="text-[9px] font-mono">{n.category}</Badge>
              </div>
              <p className="text-[11px] text-[#62666d] leading-relaxed font-sans">{n.content}</p>
            </div>
            <div className="mt-2 pt-2 border-t border-[#23252a] flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => handleDelete(n.id)} className="h-6 text-[10px] text-[#62666d] hover:text-[#eb5757] px-2">
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
