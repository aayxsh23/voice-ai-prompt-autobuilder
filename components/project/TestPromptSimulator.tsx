import React from 'react';
import { Card, Button, Input, Badge } from '../ui';
import { RotateCcw, Bot, User, Send } from 'lucide-react';

interface Props {
  projectId: string;
  defaultPersona?: string;
  initialMessage?: string;
}

interface Turn {
  sender: 'caller' | 'agent';
  text: string;
  intent?: string;
  guardrail?: boolean;
}

export const TestPromptSimulator: React.FC<Props> = ({ projectId, defaultPersona = 'easy caller', initialMessage = '' }) => {
  const [persona, setPersona] = React.useState(defaultPersona);
  const [msg, setMsg] = React.useState(initialMessage);
  const [history, setHistory] = React.useState<Turn[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (initialMessage && history.length === 0) {
      handleSendTurn(initialMessage);
    }
  }, [initialMessage]);

  const handleSendTurn = async (customMsg?: string) => {
    const toSend = customMsg || msg;
    if (!toSend.trim() || loading) return;

    const callerTurn: Turn = { sender: 'caller', text: toSend };
    const updatedHistory = [...history, callerTurn];
    setHistory(updatedHistory);
    if (!customMsg) setMsg('');
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callerMessage: toSend,
          persona,
          conversationHistory: updatedHistory
        })
      });
      const data = await res.json();
      setHistory([
        ...updatedHistory,
        {
          sender: 'agent',
          text: data.simulatedResponse || "Error generating response.",
          intent: data.detectedIntent,
          guardrail: data.guardrailTriggered
        }
      ]);
    } catch (e) {
      setHistory([...updatedHistory, { sender: 'agent', text: "Error connecting to simulator." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-[700px] p-0 overflow-hidden">
      <div className="bg-[#0f1011] px-4 py-3 flex items-center justify-between border-b border-[#23252a] shrink-0">
        <span className="font-medium text-[13px] text-[#d0d6e0]">Voice Turn Simulator</span>
        <div className="flex items-center space-x-2">
          <select
            value={persona}
            onChange={e => setPersona(e.target.value)}
            className="bg-[#383b3f] text-[11px] text-[#d0d6e0] rounded-[6px] border-none px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5e6ad2] font-mono"
          >
            <option value="easy caller">Easy Caller</option>
            <option value="angry caller">Angry Caller</option>
            <option value="price-sensitive caller">Price Sensitive</option>
            <option value="emergency caller">Emergency</option>
          </select>
          <Button variant="ghost" size="sm" onClick={() => setHistory([])} className="h-7 text-[11px]">
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#08090a]">
        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-2">
            <Bot className="h-8 w-8 text-[#323334]" />
            <p className="text-[12px] text-[#62666d]">Type a caller utterance to test intent routing and readback rules.</p>
          </div>
        ) : (
          history.map((turn, i) => (
            <div key={i} className={`flex flex-col ${turn.sender === 'caller' ? "items-end" : "items-start"}`}>
              <div className="flex items-center space-x-1.5 mb-1">
                <span className="text-[10px] uppercase font-mono text-[#62666d]">
                  {turn.sender === 'caller' ? persona : "Agent"}
                </span>
                {turn.intent && <Badge variant="outline" className="text-[9px] py-0 font-mono">{turn.intent}</Badge>}
                {turn.guardrail && <Badge variant="warning" className="text-[9px] py-0">Guardrail</Badge>}
              </div>
              <div
                className={`max-w-[80%] rounded-[12px] px-4 py-3 text-[12px] leading-relaxed ${
                  turn.sender === 'caller'
                    ? "bg-[#5e6ad2] text-white rounded-tr-[2px]"
                    : "bg-[#161718] text-[#d0d6e0] border border-[#23252a] rounded-tl-[2px]"
                }`}
              >
                {turn.text}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex items-center space-x-2 text-[12px] text-[#62666d] pl-2">
            <Bot className="h-3.5 w-3.5" />
            <span>Generating reply...</span>
          </div>
        )}
      </div>

      <div className="p-3 bg-[#0f1011] border-t border-[#23252a] shrink-0 flex items-center gap-2">
        <Input
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSendTurn()}
          placeholder={`Type as "${persona}"...`}
          className="h-9 text-[12px]"
        />
        <Button onClick={() => handleSendTurn()} disabled={!msg.trim() || loading} className="h-9 px-4">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
};
