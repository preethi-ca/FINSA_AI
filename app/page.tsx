"use client";
import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, ShieldCheck, TrendingUp } from 'lucide-react';

const FinsaChatPro = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'ai', content: 'Welcome to FINSA AI. How can I assist your finance journey today?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Ref to automatically scroll to the bottom of the chat
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    const userQuery = input.toLowerCase();
    setInput('');
    setIsTyping(true);

    // MOCK RESPONSE LOGIC 
    setTimeout(() => {
      let aiResponse = "That's a great question. I'm currently in demo mode, but I can tell you that our portfolios are a great way to gain hands-on experience.";

      if (userQuery.includes("bull's cage") || userQuery.includes("bulls cage")) {
        aiResponse = "Bull's Cage is our flagship stock pitch competition. It’s a great way to practice valuation and presentation skills in front of industry judges!";
      } else if (userQuery.includes("hiring") || userQuery.includes("apply") || userQuery.includes("join")) {
        aiResponse = "Our main recruitment cycle happens in September. Keep an eye on the 'Join Us' page for application details!";
      } else if (userQuery.includes("portfolio")) {
        aiResponse = "FINSA has several portfolios including Public Equity, Private Equity, and Fixed Income. Each offers unique learning opportunities.";
      }

      setMessages((prev) => [...prev, { role: 'ai', content: aiResponse }]);
      setIsTyping(false);
    }, 1200);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end font-sans text-slate-900">
      {/* 1. The Chat Window */}
      {isOpen && (
        <div className="mb-4 w-80 sm:w-[400px] h-[550px] flex flex-col border border-white/20 rounded-3xl bg-white/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden animate-in fade-in zoom-in duration-200">

          {/* High-End Header */}
          <div className="bg-[#1a1a1a] p-5 text-white flex justify-between items-center border-b border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-[#582C83]" />
                <h2 className="text-lg font-bold tracking-tight leading-none">FINSA AI</h2>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold italic">Institutional Access</span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Chat Body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5 bg-[#fcfcfc]">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-4 rounded-2xl text-[13.5px] leading-relaxed max-w-[85%] shadow-sm ${msg.role === 'user'
                    ? 'bg-[#582C83] text-white rounded-tr-none'
                    : 'bg-white border border-gray-100 text-gray-700 rounded-tl-none'
                  }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-tl-none flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                </div>
              </div>
            )}
          </div>

          {/* Professional Input Area */}
          <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-100 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Inquire about recruitment..."
              className="flex-1 bg-gray-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#582C83]/20 outline-none transition-all"
            />
            <button type="submit" className="bg-[#1a1a1a] text-white p-3 rounded-xl hover:bg-[#333] transition-all active:scale-95">
              <Send size={18} />
            </button>
          </form>

          {/* Footer Branding */}
          <div className="bg-gray-50 py-2 px-4 flex justify-center border-t border-gray-100">
            <span className="text-[9px] text-gray-400 uppercase tracking-[0.2em] font-medium flex items-center gap-1">
              <ShieldCheck size={10} /> Verified Student Resource
            </span>
          </div>
        </div>
      )}

      {/* Premium Launcher Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-[#1a1a1a] text-white w-16 h-16 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform active:scale-90 group"
      >
        {isOpen ? <X size={28} /> : (
          <div className="relative">
            <MessageCircle size={30} className="group-hover:rotate-12 transition-transform" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#582C83] border-2 border-[#1a1a1a] rounded-full"></div>
          </div>
        )}
      </button>
    </div>
  );
};

export default FinsaChatPro;