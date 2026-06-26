export interface UseCaseTemplate {
  id: string;
  name: string;
  industry: string;
  description: string;
  defaultIntents: string[];
  commonRequiredFields: string[];
  commonOptionalFields: string[];
  commonRiskRules: string[];
  suggestedFunctions: string[];
  commonFaqs: string[];
  commonObjections: string[];
  commonEdgeCases: string[];
  defaultTone: string;
  defaultPace: string;
}

export const USE_CASE_TEMPLATES: UseCaseTemplate[] = [
  {
    id: "clinic_receptionist",
    name: "Clinic Receptionist Prompt",
    industry: "Healthcare",
    description: "Front desk clinical AI managing patient appointments, nurse callbacks, and general practice enquiries.",
    defaultIntents: [
      "new appointment booking",
      "rescheduling",
      "cancellation",
      "callback request",
      "clinic hours enquiry",
      "general enquiry"
    ],
    commonRequiredFields: [
      "caller_name",
      "caller_phone",
      "new_or_returning_patient",
      "reason_for_visit",
      "preferred_date",
      "preferred_time"
    ],
    commonOptionalFields: [
      "preferred_practitioner",
      "email",
      "insurance_or_health_fund"
    ],
    commonRiskRules: [
      "Do not provide medical advice",
      "Do not diagnose",
      "Do not provide treatment recommendations",
      "Escalate urgent medical issues",
      "Do not confirm appointment availability unless the final implementation provides an availability-checking function",
      "Do not guess insurance acceptance",
      "Do not recommend which doctor is clinically suitable"
    ],
    suggestedFunctions: [
      "check_availability",
      "create_booking",
      "reschedule_booking",
      "cancel_booking",
      "log_callback_request",
      "handoff_to_human"
    ],
    commonFaqs: [
      "business hours",
      "location",
      "same-day appointments",
      "walk-ins",
      "insurance",
      "what to bring",
      "which doctor to see",
      "callback expectations",
      "cancellation policy"
    ],
    commonObjections: [
      "I want to speak to a real doctor right now",
      "Why do I have to give my reason for visit?",
      "Can you squeeze me in today even if fully booked?"
    ],
    commonEdgeCases: [
      "Caller reporting acute emergency symptoms (chest pain, breathing issues)",
      "Caller demanding confidential test results over the phone",
      "Caller refusing to provide a phone number"
    ],
    defaultTone: "Warm, welcoming, professional, calm",
    defaultPace: "Moderate, unhurried"
  },
  {
    id: "real_estate_enquiry",
    name: "Real Estate Enquiry Prompt",
    industry: "Real Estate",
    description: "Inbound buyer and seller lead qualification assistant capturing budget, timeframe, and scheduling showings.",
    defaultIntents: [
      "property showing request",
      "listing price & HOA enquiry",
      "home valuation / selling enquiry",
      "open house schedule",
      "realtor callback request"
    ],
    commonRequiredFields: [
      "caller_name",
      "caller_phone",
      "buyer_or_seller",
      "target_location",
      "budget_range",
      "timeframe_to_move"
    ],
    commonOptionalFields: [
      "mortgage_pre_approval",
      "bedrooms_bathrooms_criteria",
      "current_home_to_sell"
    ],
    commonRiskRules: [
      "Do not guarantee property availability or final negotiation prices",
      "Do not offer financial or mortgage lending rates",
      "Do not make Fair Housing discrimination statements",
      "Escalate complex escrow or legal zoning questions to licensed realtors"
    ],
    suggestedFunctions: [
      "search_properties",
      "schedule_showing",
      "create_crm_lead",
      "assign_agent_callback"
    ],
    commonFaqs: [
      "HOA dues",
      "school districts",
      "property taxes",
      "pet restrictions",
      "down payment requirements"
    ],
    commonObjections: [
      "I am just browsing, I don't want an agent calling me",
      "Prices are too high in this area",
      "Why do you need to know if I am pre-approved?"
    ],
    commonEdgeCases: [
      "Caller wanting to make an immediate blind cash offer",
      "Caller asking about neighborhood demographic or crime statistics",
      "Unrepresented buyer wanting listing agent dual agency discount"
    ],
    defaultTone: "Polished, enthusiastic, highly knowledgeable, consultative",
    defaultPace: "Energetic yet articulate"
  },
  {
    id: "restaurant_reservation",
    name: "Restaurant Reservation Prompt",
    industry: "Hospitality",
    description: "Maître D' assistant handling dinner reservations, dietary restrictions, party size changes, and parking.",
    defaultIntents: [
      "book dinner table",
      "modify reservation",
      "cancel table",
      "menu & allergen enquiry",
      "private dining / large party request"
    ],
    commonRequiredFields: [
      "caller_name",
      "caller_phone",
      "party_size",
      "reservation_date",
      "reservation_time"
    ],
    commonOptionalFields: [
      "dietary_allergies",
      "special_occasion",
      "indoor_or_patio_preference"
    ],
    commonRiskRules: [
      "Do not guarantee exact table seating locations (e.g. window tables)",
      "Do not claim 100% allergen-free kitchen environments",
      "Parties of 8+ must be transferred to private dining coordinator"
    ],
    suggestedFunctions: [
      "check_table_availability",
      "reserve_table",
      "cancel_reservation",
      "send_sms_confirmation"
    ],
    commonFaqs: [
      "dress code",
      "corkage fee",
      "valet parking",
      "vegan / gluten-free options",
      "kids menu"
    ],
    commonObjections: [
      "Can you squeeze 2 more people into our table of 4?",
      "We are running 30 minutes late, don't give away our table",
      "Why is there a cancellation deposit?"
    ],
    commonEdgeCases: [
      "Caller asking if pets are allowed inside the dining room",
      "Caller wanting to bring outside cake (plating fee)",
      "Intoxicated or abusive caller demanding immediate seating"
    ],
    defaultTone: "Hospitable, refined, cheerful, accommodating",
    defaultPace: "Moderate, upbeat"
  },
  {
    id: "saas_demo_booking",
    name: "SaaS Demo Booking Prompt",
    industry: "Technology",
    description: "Inbound Sales Development Rep (SDR) qualifying software buyers and booking account executive demos.",
    defaultIntents: [
      "book product demo",
      "pricing tier enquiry",
      "security & compliance compliance check",
      "technical integration capability check",
      "free trial support"
    ],
    commonRequiredFields: [
      "caller_name",
      "company_name",
      "work_email",
      "team_size",
      "primary_use_case",
      "demo_date_preference"
    ],
    commonOptionalFields: [
      "current_software_stack",
      "estimated_timeline",
      "decision_maker_role"
    ],
    commonRiskRules: [
      "Do not invent enterprise custom discounts or quote firm contract numbers",
      "Do not promise unreleased roadmap features as currently live",
      "Do not disparage competitors with unverified claims"
    ],
    suggestedFunctions: [
      "enrich_company_domain",
      "check_ae_calendar",
      "book_demo_meeting",
      "push_to_hubspot_salesforce"
    ],
    commonFaqs: [
      "SOC2 compliance",
      "API rate limits",
      "single sign-on (SSO)",
      "billing cycle",
      "onboarding duration"
    ],
    commonObjections: [
      "We already use your competitor and switching is too hard",
      "Just send me a PDF brochure instead of booking a call",
      "Your pricing is higher than startup budgets"
    ],
    commonEdgeCases: [
      "Student or hobbyist calling for free trial access (disqualify politely)",
      "Existing enterprise client calling SDR line for urgent server outages",
      "Caller refusing to provide work email (only personal gmail)"
    ],
    defaultTone: "Consultative, sharp, tech-savvy, helpful, efficient",
    defaultPace: "Crisp and energetic"
  },
  {
    id: "customer_support",
    name: "Customer Support Prompt",
    industry: "Customer Service",
    description: "Tier 1 omnichannel support AI troubleshooting issues, checking order status, and processing returns.",
    defaultIntents: [
      "check order status",
      "report defective item / technical issue",
      "return or exchange request",
      "billing discrepancy enquiry",
      "account password reset"
    ],
    commonRequiredFields: [
      "caller_name",
      "caller_phone",
      "order_number_or_account_id",
      "issue_description"
    ],
    commonOptionalFields: [
      "device_model",
      "purchase_date",
      "preferred_resolution"
    ],
    commonRiskRules: [
      "Do not issue refunds exceeding $50 without supervisor approval",
      "Do not ask for full credit card numbers or CVV codes over the voice channel",
      "Always authenticate caller identity before discussing account specifics"
    ],
    suggestedFunctions: [
      "verify_account_pin",
      "get_shipment_tracking",
      "create_zendesk_ticket",
      "initiate_return_label",
      "transfer_to_tier2"
    ],
    commonFaqs: [
      "return window",
      "shipping carriers",
      "warranty coverage",
      "store credit vs original payment refund",
      "international shipping"
    ],
    commonObjections: [
      "I have been waiting 2 weeks, I want my money back right now",
      "The online tracking says delivered but I never received it",
      "Your chatbot didn't help me, I want a supervisor"
    ],
    commonEdgeCases: [
      "Caller extremely angry and swearing (de-escalation warning)",
      "Caller reporting stolen package or credit card fraud",
      "Caller calling about a product bought from an unauthorized third party reseller"
    ],
    defaultTone: "Empathetic, patient, reassuring, solution-oriented",
    defaultPace: "Patient, calm"
  },
  {
    id: "recruitment_screening",
    name: "Recruitment Screening Prompt",
    industry: "Human Resources",
    description: "Talent acquisition AI conducting preliminary phone interviews and screening job applicants.",
    defaultIntents: [
      "job application screening",
      "interview rescheduling",
      "salary & benefits enquiry",
      "remote vs office policy check",
      "application status update"
    ],
    commonRequiredFields: [
      "candidate_name",
      "phone_number",
      "position_applied_for",
      "years_of_experience",
      "notice_period_duration",
      "salary_expectation"
    ],
    commonOptionalFields: [
      "portfolio_url",
      "willingness_to_relocate",
      "work_authorization_visa_status"
    ],
    commonRiskRules: [
      "Strictly comply with EEOC guidelines (no questions about age, marital status, religion, pregnancy, or disability)",
      "Do not make formal job offers or commit to interview hiring outcomes",
      "Keep compensation answers strictly within stated approved ranges"
    ],
    suggestedFunctions: [
      "lookup_application_ats",
      "record_screening_notes",
      "schedule_hiring_manager_interview",
      "send_assessment_link"
    ],
    commonFaqs: [
      "company culture",
      "health insurance benefits",
      "probationary period",
      "career growth paths",
      "equipment provided"
    ],
    commonObjections: [
      "Why can't you tell me the exact salary ceiling?",
      "I don't want to do a take-home coding assignment",
      "Can I skip the recruiter screening and talk directly to the VP?"
    ],
    commonEdgeCases: [
      "Candidate disclosing a disability requiring interview accommodation",
      "Candidate asking if the company tracks employee keystrokes",
      "Overqualified candidate demanding senior title upgrade"
    ],
    defaultTone: "Professional, encouraging, objective, structured",
    defaultPace: "Clear, conversational"
  },
  {
    id: "education_counselling",
    name: "Education Counselling Prompt",
    industry: "Education",
    description: "Admissions advisor AI answering course curriculum queries, tuition fees, campus tours, and deadlines.",
    defaultIntents: [
      "course syllabus enquiry",
      "admissions requirement check",
      "tuition & scholarship enquiry",
      "book campus tour",
      "application deadline check"
    ],
    commonRequiredFields: [
      "student_name",
      "caller_phone",
      "program_of_interest",
      "current_highest_education",
      "target_intake_semester"
    ],
    commonOptionalFields: [
      "gpa_or_test_scores",
      "financial_aid_needed",
      "international_student_status"
    ],
    commonRiskRules: [
      "Do not guarantee admission acceptance or scholarship award amounts",
      "Do not provide official immigration or student visa legal advice",
      "Accreditation claims must match official university charter notes"
    ],
    suggestedFunctions: [
      "check_course_catalog",
      "schedule_advisor_meeting",
      "book_campus_tour",
      "mail_prospectus_packet"
    ],
    commonFaqs: [
      "online vs on-campus classes",
      "transfer credit transferability",
      "dormitory housing costs",
      "career placement statistics",
      "part-time study options"
    ],
    commonObjections: [
      "Tuition is too expensive compared to state colleges",
      "I am worried I won't pass the entrance exam",
      "Can I work full time while taking this degree?"
    ],
    commonEdgeCases: [
      "Parent calling to inquire about adult child's academic records (FERPA restriction)",
      "International applicant inquiring about post-graduation OPT work permits",
      "Caller asking if credits transfer to an unaccredited institution"
    ],
    defaultTone: "Supportive, academic, informative, inspiring",
    defaultPace: "Patient, clear"
  },
  {
    id: "appointment_booking",
    name: "Appointment Booking Prompt",
    industry: "General Services",
    description: "General purpose appointment scheduler for salons, consultants, studios, and repair shops.",
    defaultIntents: ["book appointment", "reschedule", "cancel", "pricing enquiry"],
    commonRequiredFields: ["caller_name", "caller_phone", "service_type", "preferred_date", "preferred_time"],
    commonOptionalFields: ["staff_preference", "notes"],
    commonRiskRules: ["Do not double book", "Read back date and time before confirming"],
    suggestedFunctions: ["check_slots", "create_booking", "cancel_booking"],
    commonFaqs: ["hours", "cancellation policy", "location", "payment methods"],
    commonObjections: ["No slots available today", "Price is too high"],
    commonEdgeCases: ["Late arrivals", "No-shows calling to rebook"],
    defaultTone: "Friendly, helpful, organized",
    defaultPace: "Moderate"
  },
  {
    id: "lead_qualification",
    name: "Lead Qualification Prompt",
    industry: "Sales",
    description: "B2B / B2C general inbound lead qualification prompt gathering BANT criteria.",
    defaultIntents: ["inquire about services", "request quote", "schedule callback"],
    commonRequiredFields: ["caller_name", "caller_phone", "company_or_need", "budget", "timeline"],
    commonOptionalFields: ["email", "how_heard_about_us"],
    commonRiskRules: ["Do not quote custom pricing without sales manager review"],
    suggestedFunctions: ["log_lead", "trigger_sales_alert"],
    commonFaqs: ["coverage area", "minimum order size", "lead times"],
    commonObjections: ["Just shopping around", "Need to talk to spouse/partner"],
    commonEdgeCases: ["Competitor calling to spy on pricing"],
    defaultTone: "Professional, engaging, consultative",
    defaultPace: "Active"
  },
  {
    id: "restaurant_reservation_generic",
    name: "Restaurant Reservation Prompt (Generic)",
    industry: "Hospitality",
    description: "Alternative streamlined restaurant booking prompt.",
    defaultIntents: ["table reservation", "menu enquiry"],
    commonRequiredFields: ["caller_name", "phone", "guests", "time"],
    commonOptionalFields: ["highchair_needed"],
    commonRiskRules: ["Confirm large parties with deposit rule"],
    suggestedFunctions: ["reserve_table"],
    commonFaqs: ["parking", "corkage"],
    commonObjections: ["Fully booked at 7pm"],
    commonEdgeCases: ["Late guest arrival"],
    defaultTone: "Warm, inviting",
    defaultPace: "Moderate"
  },
  {
    id: "real_estate_enquiry_generic",
    name: "Real Estate Enquiry Prompt (Generic)",
    industry: "Real Estate",
    description: "Simplified real estate inquiry prompt.",
    defaultIntents: ["property info", "agent request"],
    commonRequiredFields: ["name", "phone", "interest"],
    commonOptionalFields: ["budget"],
    commonRiskRules: ["Fair housing compliance"],
    suggestedFunctions: ["send_listing"],
    commonFaqs: ["open house times"],
    commonObjections: ["Interest rates too high"],
    commonEdgeCases: ["Wholesaler calling"],
    defaultTone: "Professional",
    defaultPace: "Moderate"
  },
  {
    id: "insurance_intake",
    name: "Insurance Intake Prompt",
    industry: "Insurance",
    description: "First notice of loss claims intake and policy enquiry assistant.",
    defaultIntents: ["file claim", "policy coverage check", "roadside assistance request"],
    commonRequiredFields: ["policyholder_name", "policy_number", "date_of_incident", "brief_description"],
    commonOptionalFields: ["police_report_number", "injuries_involved"],
    commonRiskRules: ["Never admit fault or confirm claim payout approval over phone", "Immediate escalation if bodily injury reported"],
    suggestedFunctions: ["lookup_policy", "create_fnol_claim", "dispatch_towing"],
    commonFaqs: ["deductible amount", "rental car coverage", "claim processing time"],
    commonObjections: ["Why won't you tell me if my bumper is covered?"],
    commonEdgeCases: ["Severe accident with emergency medical vehicles present"],
    defaultTone: "Calm, reassuring, methodical, objective",
    defaultPace: "Steady, clear"
  },
  {
    id: "delivery_status",
    name: "Delivery Status Prompt",
    industry: "Logistics",
    description: "Courier and logistics shipment tracking and redelivery scheduling agent.",
    defaultIntents: ["track package", "schedule redelivery", "change delivery address", "report missing item"],
    commonRequiredFields: ["caller_name", "tracking_number"],
    commonOptionalFields: ["gate_code", "safe_drop_location"],
    commonRiskRules: ["Authenticate caller before redirecting shipment address"],
    suggestedFunctions: ["get_gps_tracking", "update_delivery_instructions"],
    commonFaqs: ["delivery window hours", "signature required rules", "depot pickup location"],
    commonObjections: ["Driver didn't knock on my door"],
    commonEdgeCases: ["Damaged package leaking contents"],
    defaultTone: "Helpful, efficient, clear",
    defaultPace: "Brisk"
  },
  {
    id: "event_registration",
    name: "Event Registration Prompt",
    industry: "Events",
    description: "Conference and workshop attendee registration and ticketing enquiry prompt.",
    defaultIntents: ["register for conference", "ticket upgrade", "workshop schedule enquiry"],
    commonRequiredFields: ["attendee_name", "email", "ticket_tier"],
    commonOptionalFields: ["dietary_needs", "company_affiliation"],
    commonRiskRules: ["Verify VIP badge eligibility"],
    suggestedFunctions: ["issue_ticket", "send_calendar_invite"],
    commonFaqs: ["wifi access", "speaker lineup", "refund policy"],
    commonObjections: ["Group discount request"],
    commonEdgeCases: ["Lost badge replacement"],
    defaultTone: "Enthusiastic, welcoming",
    defaultPace: "Upbeat"
  },
  {
    id: "hotel_booking",
    name: "Hotel Booking Prompt",
    industry: "Hospitality",
    description: "Resort and hotel room booking, concierge requests, and checkout enquiry prompt.",
    defaultIntents: ["book room", "check-in times", "room service / amenities enquiry", "request late checkout"],
    commonRequiredFields: ["guest_name", "check_in_date", "check_out_date", "room_type", "number_of_guests"],
    commonOptionalFields: ["loyalty_member_number", "bed_preference_king_or_twin"],
    commonRiskRules: ["Do not guarantee complimentary room upgrades"],
    suggestedFunctions: ["check_room_inventory", "book_reservation", "request_housekeeping"],
    commonFaqs: ["resort fee", "pool hours", "airport shuttle schedule", "pet policy"],
    commonObjections: ["Room rate higher than online travel agency"],
    commonEdgeCases: ["Guest locked out of room after midnight"],
    defaultTone: "Gracious, hospitable, polished",
    defaultPace: "Relaxed, courteous"
  },
  {
    id: "complaint_handling",
    name: "Complaint Handling Prompt",
    industry: "Customer Relations",
    description: "Dedicated escalation de-escalation AI capturing customer grievances and arranging executive callbacks.",
    defaultIntents: ["log formal complaint", "billing dispute escalation", "request executive management callback"],
    commonRequiredFields: ["customer_name", "account_or_reference_id", "grievance_summary", "desired_remedy"],
    commonOptionalFields: ["previous_agent_name"],
    commonRiskRules: ["Never argue or get defensive", "Do not admit legal liability on behalf of corporation"],
    suggestedFunctions: ["create_priority_escalation_ticket", "alert_duty_manager"],
    commonFaqs: ["escalation SLA", "formal grievance procedure"],
    commonObjections: ["I want the CEO's personal phone number"],
    commonEdgeCases: ["Threat of lawsuit or media exposure"],
    defaultTone: "Highly empathetic, patient, apologetic, respectful, steady",
    defaultPace: "Slow, attentive"
  },
  {
    id: "custom_voice_agent",
    name: "Custom Voice Agent Prompt",
    industry: "Cross-Industry",
    description: "Blank canvas enterprise template customizable for any bespoke voice automation requirement.",
    defaultIntents: ["general enquiry", "task request", "human handoff"],
    commonRequiredFields: ["caller_name", "caller_phone", "request_details"],
    commonOptionalFields: ["caller_email"],
    commonRiskRules: ["Follow strict system AI disclosure", "Escalate unhandled domain queries"],
    suggestedFunctions: ["execute_task", "handoff_to_human"],
    commonFaqs: ["general capability", "operating hours"],
    commonObjections: ["Can you do something outside your programmed scope?"],
    commonEdgeCases: ["Audio connection latency issues"],
    defaultTone: "Professional, adaptable, clear",
    defaultPace: "Conversational"
  }
];
