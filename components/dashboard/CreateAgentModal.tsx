import React, { useState } from 'react';
import { Bot, X, Wand2, Code2, ArrowRight, Layers, PhoneIncoming, PhoneOutgoing, Stethoscope, Headset, ShoppingCart, Briefcase, Building, Utensils, HeartPulse, Truck, CalendarClock, Monitor, Plane, GraduationCap, Landmark, Car, ShieldCheck, Megaphone, Users, BellRing, BadgeDollarSign } from 'lucide-react';

const TEMPLATES = [
    { id: 't1', icon: Stethoscope, name: 'Dental Appointment', desc: 'Books patient appointments, handles rescheduling, and answers basic clinic FAQs.', direction: 'inbound' },
    { id: 't2', icon: Headset, name: 'Customer Support', desc: 'Fields tier-1 support queries, creates tickets, and escalates to human agents.', direction: 'inbound' },
    { id: 't3', icon: ShoppingCart, name: 'E-Commerce Assistant', desc: 'Checks order status, handles return requests, and guides customers on shipping.', direction: 'inbound' },
    { id: 't4', icon: Briefcase, name: 'Outbound Lead Gen', desc: 'Qualifies prospects over the phone and routes hot leads to the sales team.', direction: 'outbound' },
    { id: 't5', icon: Building, name: 'Real Estate Agent', desc: 'Qualifies buyers, schedules property tours, and answers FAQs about listings.', direction: 'inbound' },
    { id: 't6', icon: Utensils, name: 'Restaurant Reservations', desc: 'Takes table bookings, modifies reservations, and handles dietary inquiries.', direction: 'inbound' },
    { id: 't7', icon: HeartPulse, name: 'Healthcare Intake', desc: 'Performs patient pre-screening, verifies insurance details, and routes to nurses.', direction: 'inbound' },
    { id: 't8', icon: Truck, name: 'Logistics Dispatch', desc: 'Updates drivers on route changes and informs customers about delivery windows.', direction: 'outbound' },
    { id: 't9', icon: CalendarClock, name: 'Salon Booking', desc: 'Manages haircuts and spa appointments, handles cancellations, and sends reminders.', direction: 'inbound' },
    { id: 't10', icon: Monitor, name: 'IT Helpdesk', desc: 'Troubleshoots common tech issues, resets passwords, and escalates complex bugs.', direction: 'inbound' },
    { id: 't11', icon: Plane, name: 'Travel Concierge', desc: 'Assists with flight changes, hotel bookings, and provides itinerary details.', direction: 'inbound' },
    { id: 't12', icon: GraduationCap, name: 'Admissions Counselor', desc: 'Answers prospective student queries about courses, deadlines, and requirements.', direction: 'inbound' },
    { id: 't13', icon: Landmark, name: 'Banking Assistant', desc: 'Checks account balances, reports lost cards, and guides users on loan applications.', direction: 'inbound' },
    { id: 't14', icon: Car, name: 'Dealership Service', desc: 'Schedules vehicle maintenance, orders parts, and updates customers on repair status.', direction: 'inbound' },
    { id: 't15', icon: ShieldCheck, name: 'Insurance Claims', desc: 'Initiates first notice of loss, collects accident details, and explains policy coverages.', direction: 'inbound' },
    { id: 't16', icon: Megaphone, name: 'Survey & Feedback', desc: 'Calls customers post-purchase to collect NPS scores, reviews, and satisfaction data.', direction: 'outbound' },
    { id: 't17', icon: PhoneOutgoing, name: 'Appointment Reminder', desc: 'Proactively reminds patients or clients about upcoming appointments and confirms attendance.', direction: 'outbound' },
    { id: 't18', icon: BadgeDollarSign, name: 'Collections Agent', desc: 'Contacts customers about overdue payments, negotiates plans, and logs commitments.', direction: 'outbound' },
    { id: 't19', icon: Users, name: 'Recruitment Screener', desc: 'Pre-screens job applicants, confirms availability, and schedules interviews with hiring managers.', direction: 'outbound' },
    { id: 't20', icon: BellRing, name: 'Renewal Reminder', desc: 'Reaches out to customers before subscription or policy expiry to drive renewals.', direction: 'outbound' },
];

const DIRECTION_FILTERS = [
    { key: 'all', label: 'All', icon: Layers },
    { key: 'inbound', label: 'Inbound', icon: PhoneIncoming },
    { key: 'outbound', label: 'Outbound', icon: PhoneOutgoing },
] as const;

interface Props {
    onClose: () => void;
    onSelectMode: (mode: 'auto' | 'scratch') => void;
}

export function CreateAgentModal({ onClose, onSelectMode }: Props) {
    const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
    const filteredTemplates = directionFilter === 'all' ? TEMPLATES : TEMPLATES.filter(t => t.direction === directionFilter);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-ink/40 backdrop-blur-sm animate-fade-in-up">
            <div className="bg-canvas w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-full border border-line">
                
                {/* Header */}
                <div className="px-6 py-4 bg-white border-b border-line flex items-center justify-between shrink-0">
                    <h2 className="text-[18px] font-semibold text-ink flex items-center gap-2">
                        <span className="bg-accent-soft text-accent w-8 h-8 rounded-lg flex items-center justify-center">
                            <Bot className="w-4 h-4" />
                        </span>
                        Create a new Agent
                    </h2>
                    <button 
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-graphite hover:bg-subtle hover:text-ink transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto">
                    
                    <h3 className="text-[11px] font-semibold text-graphite/70 uppercase tracking-wider mb-3">How would you like to start?</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                        
                        {/* Autobuilder Option */}
                        <button 
                            onClick={() => onSelectMode('auto')}
                            className="group text-left card bg-white p-4 border border-line hover:border-accent hover:shadow-md hover:ring-1 hover:ring-accent transition-all relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                <Wand2 className="w-20 h-20 text-accent" />
                            </div>
                            <div className="flex items-start gap-3 relative z-10">
                                <div className="bg-accent-soft text-accent w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                                    <Wand2 className="w-[18px] h-[18px]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-[15px] font-semibold text-ink mb-0.5 group-hover:text-accent transition-colors">AutoBuilder</h4>
                                    <p className="text-[12px] text-graphite leading-relaxed">Describe what you want and our AI generates the prompt, variables, and flow.</p>
                                    <span className="inline-flex items-center mt-2 text-accent text-[12px] font-medium">
                                        Start with AutoBuilder <ArrowRight className="w-3.5 h-3.5 ml-1 transform group-hover:translate-x-1 transition-transform" />
                                    </span>
                                </div>
                            </div>
                        </button>

                        {/* Scratch Option */}
                        <button 
                            onClick={() => onSelectMode('scratch')}
                            className="group text-left card bg-white p-4 border border-line hover:border-ink hover:shadow-md hover:ring-1 hover:ring-ink transition-all relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-3 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                                <Code2 className="w-20 h-20 text-ink" />
                            </div>
                            <div className="flex items-start gap-3 relative z-10">
                                <div className="bg-subtle text-ink-soft w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                                    <Code2 className="w-[18px] h-[18px]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-[15px] font-semibold text-ink mb-0.5">Build from scratch</h4>
                                    <p className="text-[12px] text-graphite leading-relaxed">Start blank and define prompts, logic, variables, and tool bindings manually.</p>
                                    <span className="inline-flex items-center mt-2 text-ink text-[12px] font-medium">
                                        Start empty <ArrowRight className="w-3.5 h-3.5 ml-1 transform group-hover:translate-x-1 transition-transform" />
                                    </span>
                                </div>
                            </div>
                        </button>
                        
                    </div>

                    <div className="flex items-center gap-4 w-full mb-3">
                        <div className="h-px bg-line flex-1"></div>
                        <h3 className="text-[11px] font-semibold text-graphite/70 uppercase tracking-wider shrink-0">Or start with a template</h3>
                        <div className="h-px bg-line flex-1"></div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                        {DIRECTION_FILTERS.map(f => {
                            const Icon = f.icon;
                            return (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setDirectionFilter(f.key)}
                                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                                        directionFilter === f.key
                                            ? 'bg-accent text-white border-accent'
                                            : 'bg-white text-graphite border-line hover:border-line-strong hover:text-ink'
                                    }`}
                                >
                                    <Icon className="w-3.5 h-3.5" /> {f.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {filteredTemplates.map(tpl => {
                            const Icon = tpl.icon;
                            return (
                                <button 
                                    key={tpl.id} 
                                    onClick={() => {}}
                                    className="group text-left card bg-white px-4 py-3 border border-line hover:border-accent hover:shadow-sm transition-all flex items-center gap-3 cursor-default opacity-80"
                                >
                                    <div className="bg-canvas border border-line text-ink-soft w-8 h-8 rounded flex items-center justify-center shrink-0 transition-colors">
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-[13px] font-semibold text-ink transition-colors flex items-center gap-2">{tpl.name} <span className="text-[9px] uppercase bg-subtle px-1.5 py-0.5 rounded text-faint">Coming Soon</span></h4>
                                        <p className="text-[11px] text-graphite truncate">{tpl.desc}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                </div>
            </div>
        </div>
    );
}
