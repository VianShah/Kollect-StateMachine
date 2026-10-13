/* =============================================================
   dashboard.js — Archetype-aware step engine + real API calls
   Preserves: /api/call trigger, SSE events, /api/call-direct modal
============================================================= */

const TABS = [
  { key:'b360',      label:'Borrower 360', sub:'Profile Analysis',  icon:`<path d="M20 7h-3V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a1 1 0 0 0-1-1z"/>` },
  { key:'strategy',  label:'Strategy',     sub:'AI Optimization',   icon:`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>` },
  { key:'execution', label:'Execution',    sub:'Omnichannel',        icon:`<path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>` },
  { key:'fulfilment',label:'Fulfilment',   sub:'Resolution',         icon:`<path d="M20 6L9 17l-5-5"/>` },
];

function personaTone(){ return state.voice ? state.voice.name : 'Neha'; }
function personaLang(){ return (state.voice && state.voice.lang) ? state.voice.lang : 'Hinglish'; }

// Initial strategy (Step 3/13, before any contact has happened) — grounded
// in the same pre-existing behavioral hypothesis as UNUSUAL_SIGNALS below
// (recurring cash-flow timing for systemic, historical dispute pattern for
// disputed, falling engagement for unreachable), so channel/tone/urgency
// genuinely differ per archetype instead of every case getting an identical
// "omnichannel, friendly, low urgency" readout. Technical Defaulter has no
// prior risk signal (clean history, single miss), so its low-pressure
// default IS the correct call, not a placeholder.
const STRATEGY_INIT = {
  technical: {
    agent2:'Friendly Reminder Agent', channels:'WhatsApp + Voice', tone:'Low-pressure, friendly',
    urgency:'Low', successRate:'91% success rate', timing:'10–11 AM: +32% response',
  },
  systemic: {
    agent2:'Plan-Ready Reminder Agent', channels:'WhatsApp + Voice, plan-ready', tone:'Empathetic, primed to offer a split',
    urgency:'Low', successRate:'84% success rate', timing:'10–11 AM: +28% response',
  },
  disputed: {
    agent2:'Neutral Tone Agent', channels:'WhatsApp-led, voice as backup', tone:'Neutral, fact-first',
    urgency:'Medium', successRate:'77% success rate', timing:'11 AM–12 PM: +19% response',
  },
  unreachable: {
    agent2:'Multi-Channel Push Agent', channels:'Voice-first, WhatsApp in parallel', tone:'Direct, time-boxed',
    urgency:'Medium-High', successRate:'68% success rate', timing:'Two windows: 10 AM & 4 PM',
  },
};

/* =========================================================
   ARCHETYPE PERSONA PACKS (chat lines + action strings per archetype)
========================================================= */
function personaPacks(nm, agent, lang){
  return {
    technical: {
      w1Lines:[`Namaste ${nm} ji,`,``,`Aapki EMI \u20b945,000 kal due thi.`,``,`Abhi pay karein: https://pay.link/45k`],
      w1Action:'Message sent 10:15 AM, read 10:17 AM', w1Details:`${lang} friendly reminder with payment link`,
      callType:'chat',
      callLines:[`[AI Voice Agent, FRIENDLY MODE]`,``,`Agent: Namaste ${nm} ji! Kaise hain aap? Main ${agent} bol rahi hoon, Predixion Fincorp ki taraf se.`,``,`${nm}: Haan bilkul, main abhi hi pay kar deta hoon!`],
      callAction:'Call answered, borrower agreed to pay immediately', callDetails:`AI Voice Agent, Friendly mode (${agent})`,
      sentLines:['Outcome: Payment agreed verbally','Sentiment: Cooperative, high confidence','Risk delta: -20 (improving)','','Recalculating next best action...'],
      sentAction:'Call ended: borrower confirmed payment', sentDetails:'Sentiment: cooperative, high confidence',
      nbaAction:'Confirm & close, no further contact needed', nbaDetails:'Selected over retry / escalate, borrower already committed',
      w2Title:'Payment Confirmation', w2Subtitle:'Thank-you message with receipt link',
      w2Lines:[`Dhanyawad ${nm} ji!`,``,`Aapka payment safaltapoorvak mil gaya hai.`,``,`Receipt: https://pay.link/receipt/45k`],
      w2Action:'Confirmation sent 11:35 AM', w2Details:'Auto-triggered after payment gateway confirms receipt',
      // A confirmation receipt, not a question — nothing to wait for a
      // reply on (2026-09-08 user request: only pause for a real reply
      // when the outgoing message actually asks one).
      w2ExpectsReply:false,
      s9Title:'Payment Verification', s9Subtitle:'Confirming funds cleared, no escalation needed',
      s9Lines:['Payment gateway: confirmed','LMS: reconciling balance','Account status updating to CURRENT','','No escalation required, case will auto-close'],
      s9Action:'Funds verified, reconciling with LMS', s9Details:'Escalation protocol not triggered',
      s10Title:'Case Resolved Early', s10Subtitle:'No human hand-off needed', s10Audience:'borrower', s10Contact:'Predixion Fincorp', s10ContactSub:'Business Account',
      s10Lines:[`Aapka account ab up-to-date hai, ${nm} ji.`,``,`Dhanyawad samay par jawab dene ke liye!`],
      s10Action:'Final confirmation sent 11:40 AM', s10Details:'Case closed without human involvement',
      escalate:false,
      f11Title:'Payment Confirmed', f11Subtitle:'Borrower paid in full during the call window',
      f11Action:'\u20b945,000 received at 11:38 AM', f11Details:'Payment gateway confirms full settlement',
      f11Lines:['Amount: \u20b945,000','Channel: Payment link (UPI)','Time: 11:38 AM','','Reconciling with LMS...','Case marked RESOLVED'],
      f12Action:'Recovery achieved in 2 touchpoints, no escalation', f12Details:'Time to resolution: ~28 minutes from default',
      f12Lines:['Touchpoint 1: WhatsApp (friendly), read, no action yet','Touchpoint 2: Voice call (friendly), borrower agreed immediately','No escalation needed','Outcome: Paid in full, \u20b945,000, UPI'],
      f13Lines:(nmFull)=>[`Borrower: ${nmFull}`,'Final status: RESOLVED, paid in full','Audit trail: 13 steps, 2 touchpoints','','Thank you for experiencing Kollect.'],
      nba:{
        s4:{label:'ACTION TAKEN', state:'taken', title:'Friendly WhatsApp reminder sent', reason:'Low-pressure tone selected for a Technical Defaulter, clean history means no need to escalate urgency.', metric:'91% response rate for this profile'},
        s5:{label:'ACTION TAKEN', state:'taken', title:'Friendly voice call placed', reason:'Following up warmly since WhatsApp was read but no reply yet.', metric:'Call duration: 1m 12s'},
        s6:{label:'ANALYZING', state:'analyzing', title:'Recalculating next best action', reason:'Borrower verbally confirmed payment, reassessing whether further contact is needed.', metric:'Confidence: 0.94'},
        s8:{label:'ACTION TAKEN', state:'taken', title:'Confirmation message sent', reason:'Closing the loop immediately rather than waiting for payment gateway polling.', metric:'Sent within 90s of call ending'},
        s9:{label:'NEXT BEST ACTION', state:'deciding', title:'Verify and close, skip escalation', reason:'Funds already confirmed by the gateway; a human hand-off adds no value here.', metric:'Escalation threshold not met'},
        s10:{label:'ACTION TAKEN', state:'taken', title:'Case closed, borrower notified', reason:'Fastest possible resolution, one call, one message, no escalation.', metric:'Resolved in ~25 minutes'},
      },
    },
    systemic: {
      w1Lines:[`Namaste ${nm} ji,`,``,`Aapki EMI \u20b945,000 kal due thi.`,``,`Abhi pay karein: https://pay.link/45k`],
      w1Action:'Message sent 10:15 AM, read 10:17 AM', w1Details:`${lang} friendly reminder with payment link`,
      callType:'chat',
      callLines:[`[AI Voice Agent, FRIENDLY MODE]`,``,`Agent: Namaste ${nm} ji! Kaise hain aap? Main ${agent} bol rahi hoon, Predixion Fincorp ki taraf se.`,``,`${nm}: Yaar, is mahine thoda tight hai. Kya thodi mohlat mil sakti hai?`],
      callAction:'Call answered, borrower requested more time', callDetails:`AI Voice Agent, Friendly mode (${agent})`,
      sentLines:['Outcome: Promise-to-pay (soft), needs structured plan','Sentiment: Receptive, financial strain detected','Risk delta: unchanged','','Recalculating next best action...'],
      sentAction:'Call ended: borrower asked for more time', sentDetails:'Sentiment: receptive, financially constrained',
      nbaAction:'Offer 2-installment payment plan', nbaDetails:'Selected over retry / escalate, borrower engaged but constrained',
      w2Title:'Round 2: Payment Plan Offer', w2Subtitle:'Firm-but-fair plan offer, WhatsApp',
      w2Lines:[`${nm} ji,`,``,`Hum samajhte hain ki abhi thoda mushkil hai.`,`Aapke liye 2 installments ka option hai:`,`\u20b922,500 abhi + \u20b922,500 agle hafte.`,``,`Reply karein "SPLIT" confirm karne ke liye.`],
      w2Action:'Plan offer sent 3:00 PM', w2Details:'Offers 2-installment split, empathetic tone',
      // Explicitly asks the borrower to reply "SPLIT" — this is the one
      // real trigger word wired up in server/routes/whatsappWebhook.js.
      // Auto-play pauses here for a real reply (isWaitingOnRealData);
      // s9Lines/s9Action below are the scripted assumption for the case a
      // real reply matches (or none arrives before the wait times out and
      // s9TimeoutLines takes over — see renderStep).
      w2ExpectsReply:true,
      s9Title:'Plan Acceptance Check', s9Subtitle:'Borrower reviewing installment offer',
      s9Lines:['Reply received: "SPLIT"','Plan accepted, 2 installments confirmed','No escalation needed','','Scheduling first installment reminder'],
      s9Action:'Borrower replied SPLIT at 3:22 PM', s9Details:'Plan accepted, scheduling installments',
      s9TimeoutLines:['No reply received within the wait window','Plan offer still open, not withdrawn','','Next best action: follow-up call scheduled for later today'],
      s9TimeoutAction:'No reply yet, follow-up scheduled', s9TimeoutDetails:'Plan offer stays open; escalation not warranted from silence alone',
      s10Title:'Plan Activated', s10Subtitle:'Installment schedule confirmed via WhatsApp', s10Audience:'borrower', s10Contact:'Predixion Fincorp', s10ContactSub:'Business Account',
      s10Lines:[`Perfect, ${nm} ji!`,``,`Installment 1: \u20b922,500, due today`,`Installment 2: \u20b922,500, due in 7 days`,``,`Hum aapko reminder bhejenge har installment se pehle.`],
      s10Action:'Schedule confirmed 3:25 PM', s10Details:'Case closed without human involvement',
      escalate:false,
      f11Title:'Plan Confirmed', f11Subtitle:'First installment received, second scheduled',
      f11Action:'First installment \u20b922,500 received at 3:45 PM', f11Details:'Second installment scheduled for 7 days',
      f11Lines:['Amount: \u20b922,500 (installment 1 of 2)','Channel: Payment link (UPI)','Time: 3:45 PM','','Second installment scheduled','Case marked RESOLVED (plan active)'],
      f12Action:'Recovery structured across 2 installments, no human needed', f12Details:'Time to first payment: ~5h 30m from default',
      f12Lines:['Touchpoint 1: WhatsApp (friendly), read, no action','Touchpoint 2: Voice call, requested more time','Touchpoint 3: WhatsApp (plan offer), accepted','Outcome: Plan active, \u20b922,500 of \u20b945,000 recovered so far'],
      f13Lines:(nmFull)=>[`Borrower: ${nmFull}`,'Final status: RESOLVED, payment plan active','Audit trail: 13 steps, 3 touchpoints','','Thank you for experiencing Kollect.'],
      nba:{
        s4:{label:'ACTION TAKEN', state:'taken', title:'Friendly WhatsApp reminder sent', reason:"Standard opening tone, the system doesn\u2019t presume hardship before any response.", metric:'91% response rate for this profile'},
        s5:{label:'ACTION TAKEN', state:'taken', title:'Friendly voice call placed', reason:'Following up after WhatsApp was read with no action.', metric:'Call duration: 1m 48s'},
        s6:{label:'ANALYZING', state:'analyzing', title:'Recalculating next best action', reason:'Borrower signaled financial strain, evaluating a structured plan instead of repeating the same ask.', metric:'Confidence: 0.71'},
        s8:{label:'ACTION TAKEN', state:'taken', title:'Payment plan offered', reason:'Highest expected recovery given a soft promise-to-pay with a real constraint.', metric:'Plan acceptance rate: 68% historically'},
        s9:{label:'NEXT BEST ACTION', state:'deciding', title:'Activate plan, skip escalation', reason:'Borrower engaged constructively and accepted terms; no need for human involvement.', metric:'Escalation threshold not met'},
        s10:{label:'ACTION TAKEN', state:'taken', title:'Installment schedule confirmed', reason:'Locking in the agreed plan immediately to reduce any chance of drop-off.', metric:'2 installments over 7 days'},
      },
    },
    disputed: {
      w1Lines:[`Namaste ${nm} ji,`,``,`Aapki EMI \u20b945,000 kal due thi.`,``,`Abhi pay karein: https://pay.link/45k`],
      w1Action:'Message sent 10:15 AM, read 10:17 AM', w1Details:`${lang} friendly reminder with payment link`,
      callType:'chat',
      callLines:[`[AI Voice Agent, FRIENDLY MODE]`,``,`Agent: Namaste ${nm} ji! Kaise hain aap? Main ${agent} bol rahi hoon, Predixion Fincorp ki taraf se.`,``,`${nm}: Ye charge galat hai. Maine ye pehle hi customer care ko bataya tha. Mujhe insaan se baat karni hai.`],
      callAction:'Call answered, borrower disputes the charge', callDetails:`AI Voice Agent, Friendly mode (${agent})`,
      sentLines:['Outcome: Dispute raised, distrust of automated contact','Sentiment: Skeptical, defensive','Escalation flag: borrower requested human','','Recalculating next best action...'],
      sentAction:'Call ended: borrower disputed the charge', sentDetails:'Sentiment: skeptical, defensive',
      nbaAction:'Escalate to human agent immediately', nbaDetails:'Selected over retry / plan, borrower explicitly requested a person',
      w2Title:'Round 2: WhatsApp', w2Subtitle:'Dispute acknowledgement, WhatsApp',
      w2Lines:[`${nm} ji,`,``,`Hum aapki dispute note kar rahe hain.`,`Hamari team jald aapse contact karegi is charge ko clarify karne ke liye.`],
      w2Action:'Acknowledgement sent 3:00 PM', w2Details:'Confirms dispute logged, sets expectation for human contact',
      // Sets an expectation, doesn't ask a question — already escalating
      // regardless of whether the borrower replies to this.
      w2ExpectsReply:false,
      s9Title:'Escalation Check', s9Subtitle:'Explicit human request, evaluating hand-off',
      s9Lines:['Escalation trigger: explicit human request (not confidence-based)','Dispute flag: charge validity questioned','','Escalating to human collections agent...','Preparing case summary + dispute context'],
      s9Action:'Borrower explicitly requested human, immediate escalation', s9Details:'Not a confidence-threshold escalation, trust/dispute issue',
      s10Title:'Human Handoff', s10Subtitle:'WhatsApp summary sent to collections executive', s10Audience:'agent', s10Contact:'Kollect Escalations', s10ContactSub:'Automated alert',
      s10Lines:(nmFull, phone)=>[`\u26a0 Dispute, ${nmFull} (\u20b945,000, overdue)`,'','Borrower disputes charge validity.','Requested human contact explicitly.','Sentiment: skeptical, defensive.',``,`Contact: ${phone || '+91 98xxxxxxx0'}`,'Please call within 2 hours, dispute context attached.'],
      s10Action:'Summary + phone number sent to human agent', s10Details:'Human takes over from here, Kollect stands by',
      escalate:true,
      f11Title:'Escalation Confirmed', f11Subtitle:'Case now owned by a human collections executive',
      f11Action:'Handoff acknowledged by Collections Exec #4 at 4:10 PM', f11Details:'Kollect resumes automated contact only if the case returns to queue',
      f11Lines:['Case owner: Collections Exec #4','Dispute context: attached','Automated contact: paused','','Awaiting human resolution'],
      f12Action:'Escalated after 2 touchpoints, dispute could not be resolved automatically', f12Details:'Time to escalation: ~3h 45m from default',
      f12Lines:['Touchpoint 1: WhatsApp (friendly), read, no action','Touchpoint 2: Voice call, borrower disputed charge','Touchpoint 3: WhatsApp (acknowledgement)','Outcome: Escalated to human, \u20b945,000 still outstanding'],
      f13Lines:(nmFull)=>[`Borrower: ${nmFull}`,'Final status: ESCALATED, with human collections team','Audit trail: 13 steps, 3 touchpoints','','Kollect remains available if the case returns to automation.'],
      nba:{
        s4:{label:'ACTION TAKEN', state:'taken', title:'Friendly WhatsApp reminder sent', reason:'Standard opening, no dispute signal exists yet at this point.', metric:'91% response rate for this profile'},
        s5:{label:'ACTION TAKEN', state:'taken', title:'Friendly voice call placed', reason:'Following up after WhatsApp was read with no reply.', metric:'Call duration: 2m 05s'},
        s6:{label:'ANALYZING', state:'analyzing', title:'Recalculating next best action', reason:'Borrower disputed the charge and asked for a human, this overrides the standard reminder sequence.', metric:'Confidence: 0.38'},
        s8:{label:'ACTION TAKEN', state:'taken', title:'Dispute acknowledgement sent', reason:'Logging the dispute and setting expectations while escalation is prepared.', metric:'Escalation already in motion'},
        s9:{label:'NEXT BEST ACTION', state:'deciding', title:'Escalate to human agent', reason:'Explicit request overrides confidence scoring, this is a policy rule, not a threshold call.', metric:'Trigger: explicit request, not confidence'},
        s10:{label:'ACTION TAKEN', state:'taken', title:'Case hand-off sent to human agent', reason:"Full dispute context attached so the human doesn\u2019t start from zero.", metric:'Routed to Collections Exec #4'},
      },
    },
    unreachable: {
      w1Lines:[`Namaste ${nm} ji,`,``,`Aapki EMI \u20b945,000 kal due thi.`,``,`Abhi pay karein: https://pay.link/45k`],
      w1Action:'Message sent 10:15 AM, not yet read', w1Details:`${lang} friendly reminder with payment link`,
      callType:'terminal',
      callTitle:'Round 1: Call Attempt', callSubtitle:'No answer after 6 rings',
      callLines:['Dialing...','Ringing... (6 rings)','No answer','Voicemail: box full, cannot leave message','','Logging failed contact attempt'],
      callAction:'Call attempted at 11:30 AM, no answer', callDetails:'Voicemail box full, call ended without contact',
      sentTitle:'Contact Attempt Analysis',
      sentLines:['Outcome: No contact established','Both channels attempted (WhatsApp + call), no response','Risk delta: +5 (non-response is a risk signal)','','Recalculating next best action...'],
      sentAction:'No response across both channels', sentDetails:'Escalation being considered',
      nbaAction:'Escalate, automated channels exhausted', nbaDetails:'Selected over retry, 2 failed attempts already logged',
      w2Title:'Round 2: WhatsApp', w2Subtitle:'Final attempt, WhatsApp',
      w2Lines:[`${nm} ji,`,``,`Hum aapse sampark karne ki koshish kar rahe hain.`,`Kripya jab possible ho, is number par reply karein ya call back karein.`,``,`Payment link: https://pay.link/45k`],
      w2Action:'Final message sent 3:00 PM, not yet read', w2Details:'Last automated attempt before human escalation',
      // Explicitly asks the borrower to reply or call back — but this
      // archetype's own premise is that they don't, so no separate timeout
      // override is needed: the existing s9Lines below already describe
      // "0 responses" as the expected outcome, not a fallback.
      w2ExpectsReply:true,
      s9Title:'Escalation Check', s9Subtitle:'Channels exhausted, evaluating hand-off',
      s9Lines:['2 channels attempted, 0 responses','Automated contact exhausted','','Escalating to human for manual outreach...','Preparing case summary + alternate contact search'],
      s9Action:'No response across 2 channels, 2 attempts each', s9Details:'Escalating for manual follow-up, not a dispute',
      s10Title:'Human Handoff', s10Subtitle:'WhatsApp summary sent to collections executive', s10Audience:'agent', s10Contact:'Kollect Escalations', s10ContactSub:'Automated alert',
      s10Lines:(nmFull, phone, days)=>[`\u26a0 Unreachable, ${nmFull} (\u20b945,000, ${days||''}d overdue)`,'','2 WhatsApp + 1 call attempted, zero response.','No dispute, simply unreachable via these channels.',``,`Contact: ${phone || '+91 98xxxxxxx0'}`,'Recommend alternate contact method or field visit.'],
      s10Action:'Summary + phone number sent to human agent', s10Details:'Human takes over from here, Kollect stands by',
      escalate:true,
      f11Title:'Escalation Confirmed', f11Subtitle:'Case now owned by a human collections executive',
      f11Action:'Handoff acknowledged by Collections Exec #4 at 4:10 PM', f11Details:'Kollect resumes automated contact if the borrower re-engages',
      f11Lines:['Case owner: Collections Exec #4','Contact attempts: 4 (0 successful)','Automated contact: paused','','Awaiting manual outreach outcome'],
      f12Action:'Escalated after 4 contact attempts across 2 channels', f12Details:'Time to escalation: ~5h 30m from default',
      f12Lines:['Touchpoint 1: WhatsApp (friendly), sent, not read','Touchpoint 2: Voice call, no answer','Touchpoint 3: WhatsApp (final attempt), sent, not read','Outcome: Escalated to human, \u20b945,000 still outstanding'],
      f13Lines:(nmFull)=>[`Borrower: ${nmFull}`,'Final status: ESCALATED, unreachable via automated channels','Audit trail: 13 steps, 4 contact attempts','','Kollect remains available if the borrower re-engages.'],
      nba:{
        s4:{label:'ACTION TAKEN', state:'taken', title:'Friendly WhatsApp reminder sent', reason:'Standard opening tone, no signal yet that this account is hard to reach.', metric:'91% response rate for this profile'},
        s5:{label:'ACTION TAKEN', state:'taken', title:'Voice call attempted', reason:'Following up after WhatsApp went unread.', metric:'No answer after 6 rings'},
        s6:{label:'ANALYZING', state:'analyzing', title:'Recalculating next best action', reason:'Zero response across two channels is itself a signal, reassessing contact strategy.', metric:'Confidence: 0.22'},
        s8:{label:'ACTION TAKEN', state:'taken', title:'Final automated reminder sent', reason:'One last attempt before committing to a human hand-off, per policy.', metric:'2nd attempt, still unread'},
        s9:{label:'NEXT BEST ACTION', state:'deciding', title:'Escalate, channels exhausted', reason:'Automated contact has a ceiling; a human can try alternate numbers or a field visit.', metric:'2 attempts each channel, 0 responses'},
        s10:{label:'ACTION TAKEN', state:'taken', title:'Case handed to human agent', reason:'Manual outreach with alternate contact methods now has better odds than continuing to automate.', metric:'Routed to Collections Exec #4'},
      },
    },
  };
}

function getNbaOptions(archId){
  const sets = {
    technical: [
      { title:'Payment now, confirm & close', desc:'Borrower verbally agreed on the call. Fastest path, no further contact needed.', chosen:true },
      { title:'Retry, friendly follow-up', desc:'Not needed given verbal confirmation.' },
      { title:'Escalate to human', desc:'Not needed, cooperative borrower, no risk signal.' },
    ],
    systemic: [
      { title:'Retry, friendly voice call', desc:'Same tone, different channel. Lower urgency signal.' },
      { title:'Payment plan, 2 installments', desc:'Borrower asked for room. Highest expected recovery given soft P2P.', chosen:true },
      { title:'Escalate to human', desc:'Premature, borrower is engaged and cooperative, just constrained.' },
    ],
    disputed: [
      { title:'Retry, firm reminder', desc:'Unlikely to resolve a trust or dispute issue.' },
      { title:'Payment plan', desc:'Not relevant, borrower disputes the charge itself.' },
      { title:'Escalate to human', desc:'Borrower explicitly requested a person. More automated contact erodes trust further.', chosen:true },
    ],
    unreachable: [
      { title:'Retry, voice call again', desc:'Already attempted twice with no pickup, diminishing returns.' },
      { title:'Wait 24h, re-attempt', desc:'Risk: promise window may lapse without any nudge.' },
      { title:'Escalate to human', desc:'Automated channels exhausted. Manual outreach has better reach for silent accounts.', chosen:true },
    ],
  };
  return sets[archId] || sets.technical;
}

/* =========================================================
   STEP DATA BUILDER (archetype-aware)
========================================================= */
function steps(){
  const nm          = state.name.split(' ')[0];
  const agent       = personaTone();
  const lang        = personaLang();
  const arch        = state.archetype || archetypes[0];
  const archId      = arch.id;
  const archTitle   = arch.title;
  const overdueDays = arch.overdueDays || 1;
  const P           = personaPacks(nm, agent, lang)[archId];
  const finalStatus = P.escalate ? 'escalated' : 'done';
  const finalClassV = archTitle;
  const STRAT       = STRATEGY_INIT[archId] || STRATEGY_INIT.technical;

  return [
  { tab:'b360', pill:'Step 1/13', title:'Default Detection', subtitle:`Payment of \u20b945,000 missed on due date`,
    action:'Initiating Borrower 360 analysis', details:'System triggers workflow automation', classV:'Analyzing\u2026', status:'progress',
    live:{type:'terminal', tag:'DEFAULT DETECTED', voice:false, lines:[`Borrower: ${state.name}`,`Amount: \u20b945,000`,`Days Past Due: ${overdueDays}`,'',`Initiating 360\u00b0 analysis...`]},
    agents:['Default Detection Agent','Data Orchestration Agent'], models:['Anomaly Detection (XGBoost)','Priority Scoring Model'],
    signals:[{name:'Payment Gateway', tag:'miss', desc:'Payment failure at 11:59 PM'},{name:'LMS', tag:'status', desc:'Account status: OVERDUE'}],
  },
  { tab:'b360', pill:'Step 2/13', title:'Signal Aggregation', subtitle:'Pulling structured + behavioral data across systems',
    action:'Merging LMS, CRM and bank feeds', details:'Cross-referencing 3 data sources in real time', classV:archTitle, status:'progress',
    live:{type:'terminal', tag:'AGGREGATING SIGNALS', voice:false, lines:['18-month repayment history: clean','Employment: Software Engineer, \u20b985k/mo','Bank balance: \u20b91.2L (sufficient)','App usage: daily active, high engagement','','Classifying borrower...']},
    agents:['Data Orchestration Agent','Classification Agent'], models:['Feature Extraction','Behavioral Scoring Model'],
    signals:[{name:'CRM', tag:'profile', desc:'Employment & income verified'},{name:'Bank Feed', tag:'balance', desc:'\u20b91.2L available, funds present'},{name:'App Analytics', tag:'engagement', desc:'Daily active, WhatsApp preferred'}],
  },
  { tab:'strategy', pill:'Step 3/13', title:'Strategy Generation', subtitle:`${agent} Agent activated, reasoning over classification`,
    action:`${STRAT.channels}`, details:`${STRAT.tone} tone (${lang})`, classV:archTitle, status:'progress',
    live:{type:'terminal', tag:'STRATEGY READY', voice:false, lines:['STRATEGY READY','',`Agent: ${agent}, ${STRAT.agent2}`,`Channels: ${STRAT.channels}`,`Tone: ${STRAT.tone} (${lang})`,`Urgency: ${STRAT.urgency}`,'Time: 10:15 AM']},
    agents:['Strategy Gen Agent',STRAT.agent2], models:['Strategy Recommender','Tone Calibration (GPT)'],
    signals:[{name:'Strategy Engine', tag:'recommendation', desc:`Omnichannel: ${STRAT.successRate}`},{name:'RAG KB', tag:'policy', desc:`${archTitle} SOP retrieved`},{name:'Timing Model', tag:'optimal', desc:STRAT.timing}],
  },
  { tab:'execution', pill:'Step 4/13', title:'Round 1: WhatsApp', subtitle:'Friendly Reminder, WhatsApp',
    action:P.w1Action, details:P.w1Details, classV:archTitle, status:'progress',
    // key, not just (time, platform): the real send (triggerWhatsApp ->
    // markRealWhatsAppOutcome) mutates this entry's own `time` to the real
    // clock time once it resolves, which would otherwise stop matching this
    // scripted probe's still-'10:15 AM' lc.time on any later re-render of
    // this step and push a duplicate row (see the voice-call entry above
    // and wa-round2/wa-close below for the same fix, 2026-09-08 user report
    // of duplicate WhatsApp entries).
    lastContact:{key:'wa-round1', time:'10:15 AM', platform:'whatsapp', platformLabel:'WhatsApp', status: P.callType==='terminal' ? 'pending' : 'connected', statusLabel: P.callType==='terminal' ? 'Sent · Not Read' : 'Connected · Read'},
    live:{type:'chat', tag:'WHATSAPP', time:'10:15 AM', voice:false, contact:'Predixion Fincorp', contactSub:'Business Account', lines:P.w1Lines},
    nbaNow:P.nba.s4,
    agents:['Friendly Reminder Agent','Tracking Agent'], models:['Template Generator (GPT-4)'],
    signals:[{name:'WhatsApp API', tag:'sent', desc:'Dispatched: 10:15:03 AM'},{name:'WhatsApp API', tag:P.callType==='terminal'?'pending':'read', desc:P.callType==='terminal'?'Not yet read':'Read: 10:17:23 AM'}],
  },
  { tab:'execution', pill:'Step 5/13', title:P.callTitle || 'Round 1: Voice Agent', subtitle:P.callSubtitle || 'Friendly Voice Agent call',
    action:P.callAction, details:P.callDetails, classV:archTitle, status:'progress',
    // Neither branch claims an outcome up front anymore — the archetype
    // picks which SCRIPTED narrative unfolds on the steps around this one,
    // but the real call to the real phone number can genuinely go either
    // way (the presenter might answer a call from an "Unreachable" run, or
    // miss one from a "Technical Defaulter" run). Claiming "Connected" or
    // "No Answer" before the real call even starts ringing was misleading
    // regardless of which one it guessed — see subscribeToCallEvents's
    // 'initiated'/'completed' handlers for what actually overwrites this,
    // live, once the real outcome is known.
    // key (not just time+platform) is what updateLastContact dedupes new
    // pushes against — needed because the real call handlers below mutate
    // this entry's own `time` field once the call actually connects, which
    // would otherwise stop matching this scripted probe's still-'11:30 AM'
    // lc.time the next time this step (or step 7, same key) re-renders,
    // and push a second duplicate "Dialing…" row back into the list.
    lastContact:{key:'voice-call', time:'11:30 AM', platform:'voice', platformLabel:'Voice Call', status:'pending', statusLabel:'Dialing…'},
    live: P.callType==='terminal'
      ? {type:'terminal', tag:'CALL ATTEMPT', voice:false, lines:P.callLines}
      : {type:'chat', tag:'VOICE AGENT', time:'11:30 AM', voice:true, contact:'Predixion Fincorp', lines:P.callLines},
    nbaNow:P.nba.s5,
    agents:[`Friendly Reminder Agent (${agent})`,'Speech Analyzer'], models:['Conversational AI (GPT-4)','Sentiment Detection'],
    signals:[{name:'RAG KB', tag:'script', desc:'Friendly reminder script loaded'},{name:'Voice Agent', tag:P.callType==='terminal'?'no-answer':'connected', desc:P.callType==='terminal'?'6 rings, no pickup':'Duration: 1m 23s'}],
  },
  { tab:'execution', pill:'Step 6/13', title:P.sentTitle || 'Sentiment & Outcome Analysis', subtitle:'Reading outcome, updating borrower state',
    action:P.sentAction, details:P.sentDetails, classV:archTitle, status:'progress',
    live:{type:'terminal', tag:'CALL ANALYSIS', voice:false, lines:P.sentLines},
    nbaNow:P.nba.s6,
    agents:['Speech Analyzer','Outcome Classifier'], models:['Sentiment Detection','Promise-to-Pay Classifier'],
    signals:[{name:'Speech Analyzer', tag:'nlu', desc:'Outcome classified'},{name:'CRM', tag:'update', desc:'Sentiment score updated'}],
  },
  { tab:'strategy', pill:'Step 7/13', title:'Next Best Action', subtitle:'Strategy engine ranks 3 fixed actions, selects one',
    action:P.nbaAction, details:P.nbaDetails, classV:archTitle, status:'progress',
    // Neither branch claims an outcome up front anymore — the archetype
    // picks which SCRIPTED narrative unfolds on the steps around this one,
    // but the real call to the real phone number can genuinely go either
    // way (the presenter might answer a call from an "Unreachable" run, or
    // miss one from a "Technical Defaulter" run). Claiming "Connected" or
    // "No Answer" before the real call even starts ringing was misleading
    // regardless of which one it guessed — see subscribeToCallEvents's
    // 'initiated'/'completed' handlers for what actually overwrites this,
    // live, once the real outcome is known.
    // key (not just time+platform) is what updateLastContact dedupes new
    // pushes against — needed because the real call handlers below mutate
    // this entry's own `time` field once the call actually connects, which
    // would otherwise stop matching this scripted probe's still-'11:30 AM'
    // lc.time the next time this step (or step 7, same key) re-renders,
    // and push a second duplicate "Dialing…" row back into the list.
    lastContact:{key:'voice-call', time:'11:30 AM', platform:'voice', platformLabel:'Voice Call', status:'pending', statusLabel:'Dialing…'},
    live:{type:'nba', nbaChosen:0},
    agents:['Strategy Gen Agent','NBA Ranking Agent'], models:['Strategy Recommender','Expected Value Model'],
    signals:[{name:'NBA Engine', tag:'ranked', desc:'3 candidate actions scored'},{name:'Policy Guard', tag:'check', desc:'Decision within SOP bounds'}],
  },
  { tab:'execution', pill:'Step 8/13', title:P.w2Title, subtitle:P.w2Subtitle,
    action:P.w2Action, details:P.w2Details, classV:archTitle, status:'progress',
    lastContact:{key:'wa-round2', time:'3:00 PM', platform:'whatsapp', platformLabel:'WhatsApp', status:P.escalate?'pending':'connected', statusLabel:P.escalate?'Sent \u00b7 Not Read':'Sent \u00b7 Delivered'},
    live:{type:'chat', tag:'WHATSAPP', time:'3:00 PM', voice:false, contact:'Predixion Fincorp', contactSub:'Business Account', lines:P.w2Lines},
    // Whether auto-play pauses after this send to actually wait for a real
    // reply (isWaitingOnRealData) \u2014 only true when the message itself asks
    // a question (2026-09-08 user request: don't wait on a reply to a
    // message that was never open-ended in the first place).
    expectsReply:P.w2ExpectsReply,
    nbaNow:P.nba.s8,
    agents:['Firm Reminder Agent','Payment Plan Agent'], models:['Template Generator (GPT-4)','Plan Structuring Model'],
    signals:[{name:'WhatsApp API', tag:'sent', desc:'Dispatched: 3:00:00 PM'},{name:'WhatsApp API', tag:'delivered', desc:'Delivered: 3:00:04 PM'}],
  },
  { tab:'execution', pill:'Step 9/13', title:P.s9Title, subtitle:P.s9Subtitle,
    action:P.s9Action, details:P.s9Details, classV:archTitle, status:'progress',
    // Same key as step 8 above \u2014 this step re-points at the SAME real
    // contact attempt (Round 2) for display continuity, it doesn't create a
    // new one. Without a shared key, step 8's mutated real `time` no longer
    // matches this scripted '3:00 PM' probe on re-render, and a duplicate
    // "Accepted" row appears (2026-09-08 user report).
    lastContact:{key:'wa-round2', time:'3:00 PM', platform:'whatsapp', platformLabel:'WhatsApp', status:P.escalate?'pending':'connected', statusLabel:P.escalate?'Sent \u00b7 Not Read':'Accepted'},
    live:{type:'terminal', tag:'ESCALATION CHECK', voice:false, lines:P.s9Lines},
    // Only set where the scripted s9Lines above actually assumes a reply
    // arrived (systemic's "SPLIT") \u2014 renderStep swaps these in if the
    // real-reply wait (isWaitingOnRealData, gated by expectsReply above)
    // timed out with nothing received. Undefined for archetypes whose
    // s9Lines don't assume a reply either way.
    timeoutAction:P.s9TimeoutAction, timeoutDetails:P.s9TimeoutDetails, timeoutLines:P.s9TimeoutLines,
    nbaNow:P.nba.s9,
    agents:['Escalation Agent','Case Summary Agent'], models:['Confidence Scoring','Summarization (GPT-4)'],
    signals:[{name:'Confidence Model', tag:'evaluated', desc:P.escalate?'Escalation triggered':'No escalation needed'},{name:'Escalation Rules', tag:'policy', desc:'SOP applied'}],
  },
  { tab:'execution', pill:'Step 10/13', title:P.s10Title, subtitle:P.s10Subtitle,
    action:P.s10Action, details:P.s10Details, classV:archTitle, status:P.escalate ? 'escalated' : 'progress',
    // key shared with steps 11-13 below \u2014 they all re-point at this SAME
    // real contact attempt for display continuity as the case wraps up,
    // none of them create a new one. Without a shared key, this step's own
    // mutated real `time` (once its real send resolves) stops matching
    // their scripted '3:46 PM' probe on re-render, and duplicate rows
    // appear (2026-09-08 user report).
    lastContact:{key:'wa-close', time:'3:46 PM', platform: P.s10Audience==='agent' ? 'whatsapp' : 'whatsapp', platformLabel: P.s10Audience==='agent' ? 'WhatsApp (Agent)' : 'WhatsApp', status:'connected', statusLabel: P.s10Audience==='agent' ? 'Handoff \u00b7 Sent to Agent' : 'Connected \u00b7 Confirmed'},
    live:{type:'chat', tag:P.s10Audience==='agent'?'HANDOFF \u00b7 TO HUMAN AGENT':'WHATSAPP', time:'3:46 PM', voice:false,
      audience:P.s10Audience, contact:P.s10Contact, contactSub:P.s10ContactSub,
      lines: typeof P.s10Lines === 'function' ? P.s10Lines(state.name, state.phone, overdueDays) : P.s10Lines},
    nbaNow:P.nba.s10,
    agents:['Escalation Agent','Human Routing Agent'], models:['Summarization (GPT-4)'],
    signals:[{name:'WhatsApp API', tag:'sent', desc:P.escalate?'Handoff card sent to agent desk':'Confirmation sent to borrower'},{name:'Routing Engine', tag:P.escalate?'assigned':'closed', desc:P.escalate?'Routed to: Collections Exec #4':'No routing needed'}],
  },
  { tab:'fulfilment', pill:'Step 11/13', title:P.f11Title, subtitle:P.f11Subtitle,
    action:P.f11Action, details:P.f11Details, classV:finalClassV, status:finalStatus,
    lastContact:{key:'wa-close', time:'3:46 PM', platform:'whatsapp', platformLabel: P.s10Audience==='agent' ? 'WhatsApp (Agent)' : 'WhatsApp', status:'connected', statusLabel: P.escalate ? 'Handoff \u00b7 Acknowledged' : 'Connected \u00b7 Confirmed'},
    live:{type:'terminal', tag:P.escalate?'ESCALATION CONFIRMED':'PAYMENT CONFIRMED', voice:false, lines:P.f11Lines},
    agents:[P.escalate?'Routing Agent':'Reconciliation Agent'], models:[P.escalate?'Case Assignment':'Payment Matching'],
    signals:[{name:P.escalate?'Routing Engine':'Payment Gateway', tag:P.escalate?'assigned':'success', desc:P.escalate?'Case owner: human agent':'\u20b9 settled via UPI'},{name:'LMS', tag:'update', desc:P.escalate?'Automated contact paused':'Account status: CURRENT'}],
  },
  { tab:'fulfilment', pill:'Step 12/13', title:'Outcome Summary', subtitle:'Full journey compiled for reporting',
    action:P.f12Action, details:P.f12Details, classV:finalClassV, status:finalStatus,
    lastContact:{key:'wa-close', time:'3:46 PM', platform:'whatsapp', platformLabel: P.s10Audience==='agent' ? 'WhatsApp (Agent)' : 'WhatsApp', status:'connected', statusLabel: P.escalate ? 'Handoff \u00b7 Acknowledged' : 'Connected \u00b7 Confirmed'},
    live:{type:'terminal', tag:'JOURNEY SUMMARY', voice:false, lines:P.f12Lines},
    agents:['Reporting Agent'], models:['Journey Summarization'],
    signals:[{name:'Analytics Engine', tag:'compiled', desc:'Full journey logged'},{name:'Recovery Model', tag:'logged', desc:'Contributes to portfolio recovery rate'}],
  },
  { tab:'fulfilment', pill:'Step 13/13', title:P.escalate?'Case Handed Off':'Case Closed', subtitle:'Audit trail complete, ready for next case',
    action:'All actions, timestamps and messages logged', details:'Available for compliance review at any time', classV:finalClassV, status:finalStatus,
    lastContact:{key:'wa-close', time:'3:46 PM', platform:'whatsapp', platformLabel: P.s10Audience==='agent' ? 'WhatsApp (Agent)' : 'WhatsApp', status:'connected', statusLabel: P.escalate ? 'Handoff \u00b7 Acknowledged' : 'Connected \u00b7 Confirmed'},
    live:{type:'terminal', tag:P.escalate?'CASE HANDED OFF':'CASE CLOSED', voice:false, lines:P.f13Lines(state.name)},
    agents:['Audit Agent'], models:['Compliance Logger'],
    signals:[{name:'Audit Log', tag:'sealed', desc:'Immutable record created'},{name:'Compliance', tag:'ready', desc:'Available for lender review'}],
  },
  ];
}

/* =========================================================
   TIMERS & STEP ENGINE
========================================================= */
let stepData = [];
let idx = 0;
let playTimer = null;
let ingestTimer = null;
let behaviorIngestTimer = null;
let realCallTriggered = false;
let whatsappRound1Sent = false;
let whatsappRound2Sent = false;
let whatsappEscalationSent = false;
// Real-reply wait for an open-ended Round 2 send (expectsReply, see
// steps()) — 2026-09-08 user request: pause auto-play for a genuine
// WhatsApp reply only when the message actually asked one, bounded so a
// live booth demo can never hang forever waiting for a human to type back.
const REPLY_WAIT_MS = 45000;
let whatsappOpenEndedSentAt = null;
let whatsappReplyMatched = false;
let whatsappReplyTimedOut = false;
// Drives the auto-play pause below — a real call/analysis in flight holds
// auto-play on the current step instead of rushing past it on a fixed timer.
// Manual next/prev always works regardless of these; only the play timer checks them.
let realCallCompleted = false;
let realCallAnswered = null;
// Once a real call supplies a real NBA/summary, stop overwriting the panel
// with the scripted per-step guess on every subsequent step render.
let _nbaIsReal = false;
let _summaryIsReal = false;

// Unusual Activity + Assumed Reason only apply where the borrower's pattern
// actually deviates from normal — a clean, single missed payment (the
// 'technical' archetype) isn't unusual, so it has no entry here and the
// whole block hides for that case. Every reason is written as something
// inferred FROM the signals shown elsewhere on this panel (communication
// behaviour, engagement), not a restatement of the archetype's own blurb.
const UNUSUAL_SIGNALS = {
  systemic: {
    flag: 'Payment timing has slipped in multiple recent cycles, not just this one.',
    reason: 'Repeated late payments alongside steady WhatsApp engagement point to a recurring cash-flow timing issue, not avoidance.',
  },
  disputed: {
    flag: 'Borrower engaged immediately, but disputes the charge itself.',
    reason: 'High responsiveness on WhatsApp paired with an explicit dispute points to genuine disagreement over the charge, not evasion.',
  },
  unreachable: {
    flag: 'No response across WhatsApp or voice this cycle.',
    reason: 'Falling engagement with no response on either channel points to genuine unavailability, not active avoidance.',
  },
};

function startDash(){
  stepData = steps();
  renderEnhancedQualityToggle();
  realCallTriggered = false;
  realCallCompleted = false;
  realCallAnswered = null;
  whatsappRound1Sent = false;
  whatsappRound2Sent = false;
  whatsappEscalationSent = false;
  whatsappOpenEndedSentAt = null;
  whatsappReplyMatched = false;
  whatsappReplyTimedOut = false;
  _lastContactState = null;
  _contactHistory = [];
  _phoneHasContent = false;
  _voiceCallPhase = 'idle';
  stopCallTimer();
  goToStep(0, true);
  startIngestion();
  _nbaIsReal = false;
  _summaryIsReal = false;
  const reasonEl = document.getElementById('nbaReason');
  if(reasonEl) reasonEl.textContent = '';
  const callStatusEl = document.getElementById('realCallStatus');
  if(callStatusEl) callStatusEl.style.display = 'none';

  // Unstructured Data starts as a placeholder — real content (an actual
  // call transcript) only arrives once a real call completes; see
  // renderRealCallSummary().
  const rtOutcomeEl = document.getElementById('rtOutcome');
  const rtTranscriptEl = document.getElementById('rtTranscript');
  if(rtOutcomeEl) rtOutcomeEl.innerHTML = '';
  if(rtTranscriptEl) rtTranscriptEl.textContent = 'Awaiting first call.';
  const stageLineEl = document.getElementById('analysisStageLine');
  if(stageLineEl) stageLineEl.style.display = 'none';
  const stageTextEl = document.getElementById('analysisStageText');
  if(stageTextEl){ stageTextEl.textContent = ANALYSIS_STAGE_COPY[0]; stageTextEl.classList.remove('stage-text-enter'); }

  // Communication History starts empty each run.
  const commEmpty = document.getElementById('commEmpty');
  const commList  = document.getElementById('commList');
  if(commEmpty) commEmpty.style.display = 'block';
  if(commList) commList.innerHTML = '';

  // Unusual Activity + Assumed Reason: only shown when there IS something
  // to flag (a clean single-slip case has nothing unusual about it), and
  // the reason text is written as an inference from the OTHER signals on
  // screen (communication behaviour, engagement) — not a restatement of
  // the archetype's own description.
  const arch = state.archetype || archetypes[0];
  const entry = UNUSUAL_SIGNALS[arch.id];
  const unusualGroup      = document.getElementById('unusualGroup');
  const assumedGroup      = document.getElementById('assumedGroup');
  const unusualFlagEl     = document.getElementById('unusualFlag');
  const unusualConclusionEl = document.getElementById('unusualConclusion');
  if(entry){
    if(unusualGroup) unusualGroup.classList.add('show');
    if(assumedGroup) assumedGroup.classList.add('show');
    if(unusualFlagEl) unusualFlagEl.textContent = entry.flag;
    if(unusualConclusionEl) unusualConclusionEl.textContent = entry.reason;
  } else {
    if(unusualGroup) unusualGroup.classList.remove('show');
    if(assumedGroup) assumedGroup.classList.remove('show');
  }

  // Replay the phone pane's slide-in-from-right entrance each time the
  // dashboard is (re)entered, not just once on page load.
  const phonePane = document.getElementById('phonePane');
  if(phonePane){
    phonePane.classList.remove('phone-pane');
    void phonePane.offsetWidth; // force reflow so the animation restarts
    phonePane.classList.add('phone-pane');
  }
}

function startIngestionGroup(groupSelector, counterId, intervalMs, existingTimer){
  clearInterval(existingTimer);
  const items = document.querySelectorAll(groupSelector);
  items.forEach(el => el.classList.remove('show', 'flash'));
  const counter = document.getElementById(counterId);
  const total = items.length;
  if(counter) counter.textContent = `0/${total}`;
  let n = 0;
  let timer = null;
  function revealNext(){
    if(n >= items.length){ clearInterval(timer); return; }
    const el = items[n];
    el.classList.add('show', 'flash');
    setTimeout(() => el.classList.remove('flash'), 700);
    n++;
    if(counter) counter.textContent = `${n}/${total}`;
    if(n >= items.length) clearInterval(timer);
  }
  revealNext();
  timer = setInterval(revealNext, intervalMs);
  return timer;
}

function startIngestion(){
  ingestTimer        = startIngestionGroup('[data-ingest="structured"]', 'ingestCounter', 4000, ingestTimer);
  behaviorIngestTimer= startIngestionGroup('[data-ingest="behavioral"]', 'behaviorCounter', 4600, behaviorIngestTimer);
}

function goToStep(newIdx, instant){
  const prev = idx;
  idx = newIdx;
  // Track tab changes for time-on-tab
  const prevTab = stepData[prev] ? stepData[prev].tab : null;
  const newTab  = stepData[idx]  ? stepData[idx].tab  : null;
  if (window.track && newTab && newTab !== prevTab) {
    track('dashboard_tab_changed', { tab: newTab });
  }
  renderStep(instant);
}

/* =========================================================
   TAB RENDERING
========================================================= */
// Condensed state machine: the tab row IS the progress indicator now (no
// separate "Step X/13 · <Tab>" pill or full-width bar restating the same
// thing) — each tab gets a micro fill for how much of ITS OWN steps are
// done, plus a checkmark once every step in it has been passed.
function renderTabs(){
  const row = document.getElementById('tabRow');
  row.innerHTML = '';
  const current = stepData[idx];
  TABS.forEach(t => {
    const tabSteps = stepData.filter(s => s.tab === t.key);
    const total = tabSteps.length;
    const doneCount = stepData.slice(0, idx + 1).filter(s => s.tab === t.key).length;
    const isActive = current.tab === t.key;
    const isDone = !isActive && doneCount >= total && total > 0;
    const pct = total ? Math.min(100, (doneCount / total) * 100) : 0;
    const el = document.createElement('div');
    el.className = 'tab' + (isActive ? ' active' : '') + (isDone ? ' done' : '');
    el.innerHTML = `
      <div class="tab-icon">${isDone ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg>' : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${t.icon}</svg>`}</div>
      <div><div class="tab-title">${t.label}</div><div class="tab-sub">${t.sub}</div></div>
      <div class="tab-fill"><div class="tab-fill-bar" style="width:${pct.toFixed(0)}%"></div></div>`;
    // Strategy is the one tab that opens into the actual multi-agent,
    // multi-data-source reasoning behind the current archetype's strategy
    // (see openStrategyModal) — every other tab stays a plain progress header.
    if(t.key === 'strategy'){
      el.classList.add('tab-clickable');
      el.title = 'See how this strategy was built';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', 'See how this strategy was built');
      const hint = document.createElement('div');
      hint.className = 'tab-expand-hint';
      hint.textContent = 'View';
      el.appendChild(hint);
      el.addEventListener('click', () => openStrategyModal());
      el.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openStrategyModal(); }
      });
    }
    row.appendChild(el);
  });
}

/* =========================================================
   STRATEGY MODAL — "how this strategy was built": pulls the real
   agents/models/signals every step already carries (previously never
   displayed) and shows the data sources feeding in, the agents reasoning
   over them, and the resulting decision, for the CURRENT archetype run.
========================================================= */
function openStrategyModal(){
  const modal = document.getElementById('strategyModal');
  if(!modal) return;
  const genStep = stepData.find(s => s.title === 'Strategy Generation');
  const nbaStep = stepData.find(s => s.title === 'Next Best Action');
  const aggStep = stepData.find(s => s.title === 'Signal Aggregation');
  // The "restrategize" moment — after Round 1 executes, the outcome (or the
  // lack of one) gets fed back in and the plan gets re-evaluated before the
  // final NBA is chosen. Identified by nbaNow.state==='analyzing' rather
  // than by title since the step's own title varies (P.sentTitle).
  const restrategyStep = stepData.find(s => s.nbaNow && s.nbaNow.state === 'analyzing');
  if(!genStep || !nbaStep) return;

  const relevantSteps = [aggStep, genStep, restrategyStep, nbaStep].filter(Boolean);
  const sourceSignals = [];
  const seenSignals = new Set();
  relevantSteps.forEach(step => {
    (step.signals || []).forEach(sg => {
      const key = sg.name + '|' + sg.desc;
      if(seenSignals.has(key)) return;
      seenSignals.add(key);
      sourceSignals.push(sg);
    });
  });
  document.getElementById('strategySources').innerHTML = sourceSignals.map(sg => `
    <div class="source-node">
      <div class="src-name">${sg.name}</div>
      <div class="src-desc">${sg.desc}</div>
    </div>`).join('');

  const pairs = [];
  const seenAgents = new Set();
  relevantSteps.forEach(step => {
    (step.agents || []).forEach((name, i) => {
      if(seenAgents.has(name)) return;
      seenAgents.add(name);
      pairs.push({ name, model: (step.models && (step.models[i] || step.models[0])) || '' });
    });
  });
  document.getElementById('strategyAgents').innerHTML = pairs.map(p => `
    <div class="agent-card">
      <div class="agent-name"><span class="agent-status-dot"></span>${p.name}</div>
      <div class="agent-model">${p.model}</div>
    </div>`).join('');

  document.getElementById('strategyDecisionInitial').innerHTML = `
    <div class="dcard-label">Initial Strategy</div>
    <div class="dcard-title">${genStep.action}</div>
    <div class="dcard-desc">${genStep.details}</div>`;
  const restrategyEl = document.getElementById('strategyDecisionRestrategy');
  if(restrategyStep){
    restrategyEl.hidden = false;
    restrategyEl.innerHTML = `
      <div class="dcard-label">Restrategized After Round 1</div>
      <div class="dcard-title">${restrategyStep.nbaNow.title}</div>
      <div class="dcard-desc">${restrategyStep.nbaNow.reason}</div>`;
  } else {
    restrategyEl.hidden = true;
  }
  // Single source of truth for "what's the NBA" — read the same live
  // pointer the Signals panel shows (real, transcript-backed, once
  // _nbaIsReal flips true) instead of re-deriving from the static scripted
  // value, so this modal and the rest of the dashboard never disagree.
  const nbaPointerEl = document.getElementById('nbaPointer');
  const liveNbaTitle = (_nbaIsReal && nbaPointerEl && nbaPointerEl.textContent && nbaPointerEl.textContent !== '-')
    ? nbaPointerEl.textContent : nbaStep.action;
  const liveNbaReason = (_nbaIsReal && state.geminiAnalysis && state.geminiAnalysis.nextBestActionReason)
    ? state.geminiAnalysis.nextBestActionReason : nbaStep.details;
  document.getElementById('strategyDecisionFinal').innerHTML = `
    <div class="dcard-label">Chosen Next Best Action</div>
    <div class="dcard-title">${liveNbaTitle}</div>
    <div class="dcard-desc">${liveNbaReason}</div>`;

  const archTitle = state.archetype ? state.archetype.title : '';
  document.getElementById('strategyModalSub').textContent =
    `${pairs.length} agents · ${sourceSignals.length} data sources · ${archTitle}`;

  if(window.track) track('strategy_modal_open', { archetype: state.archetype ? state.archetype.id : null });
  modal.style.display = 'flex';
}
function closeStrategyModal(){
  const modal = document.getElementById('strategyModal');
  if(modal) modal.style.display = 'none';
}
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('strategyModal');
  const btnClose = document.getElementById('btnCloseStrategyModal');
  if(!modal) return;
  if(btnClose) btnClose.addEventListener('click', closeStrategyModal);
  modal.addEventListener('click', (e) => { if(e.target === modal) closeStrategyModal(); });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && modal.style.display !== 'none') closeStrategyModal();
  });
});

/* =========================================================
   PHONE MOCKUP RENDERER
========================================================= */
const ICON_MIC    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/></svg>`;
const ICON_SPEAKER= `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.5 8.5a5.5 5.5 0 0 1 0 7"/></svg>`;
const ICON_HANGUP = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.6 11.5c2.5-2.4 5.6-3.7 8.4-3.7s5.9 1.3 8.4 3.7c.4.4.4 1 0 1.4l-1.9 1.9c-.4.4-1 .4-1.4.1-.7-.5-1.5-.9-2.3-1.2-.4-.1-.6-.5-.6-.9v-1.7c-1.4-.4-2.9-.4-4.4 0v1.7c0 .4-.3.8-.6.9-.8.3-1.6.7-2.3 1.2-.4.3-1 .3-1.4-.1L3.6 12.9c-.4-.4-.4-1 0-1.4z"/></svg>`;
const ICON_WA_VIDEOCALL = `<svg viewBox="0 0 24 24" fill="none" stroke="#aebac1" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`;
const ICON_WA_CALL = `<svg viewBox="0 0 24 24" fill="none" stroke="#aebac1" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
const ICON_WA_EMOJI = `<svg viewBox="0 0 24 24" fill="none" stroke="#8696a0" stroke-width="1.8"><circle cx="12" cy="12" r="9.5"/><path d="M8.5 10.5h.01M15.5 10.5h.01M7.5 14.5c1 1.5 2.7 2.5 4.5 2.5s3.5-1 4.5-2.5"/></svg>`;
const ICON_WA_ATTACH = `<svg viewBox="0 0 24 24" fill="#8696a0"><path d="M16.5 6.5v10a4 4 0 0 1-8 0v-11a2.5 2.5 0 0 1 5 0v10a1 1 0 0 1-2 0v-9h-1.5v9a2.5 2.5 0 0 0 5 0v-10a4 4 0 0 0-8 0v11a5.5 5.5 0 0 0 11 0v-10z"/></svg>`;
const ICON_WA_CAMERA_SM = `<svg viewBox="0 0 24 24" fill="none" stroke="#8696a0" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const ICON_WA_MIC = `<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" stroke="#fff" stroke-width="2" fill="none"/></svg>`;

function renderWaBubble(linesArr, time){
  const bodyText = (linesArr || []).filter(l => l.trim() !== '').join('<br>');
  if(!bodyText) return '';
  return `<div class="wa-bubble-in"><div class="wa-text">${bodyText}</div><div class="wa-meta">${time || ''}</div></div>`;
}

function renderPhoneMockup(s){
  const lines = s.live.lines.filter(l => l.trim() !== '');
  if(!s.live.voice){
    const contact    = s.live.contact    || 'Predixion Fincorp';
    const contactSub = s.live.contactSub || 'Business Account';
    const initials   = contact.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
    // A follow-up message is a continuation of a real thread, not an
    // isolated card — show whatever was genuinely sent before it (steps 3
    // and, at step 9, 7 too) so the conversation reads as it actually
    // happened. Skipped for the step-9 agent-escalation case: that goes to
    // a human agent, a different recipient with no prior thread to show.
    const priorStepIdxs = idx === 7 ? [3]
      : (idx === 9 && s.live.audience !== 'agent') ? [3, 7]
      : [];
    const priorBubbles = priorStepIdxs
      .map(i => stepData[i] && renderWaBubble(stepData[i].live.lines, stepData[i].live.time))
      .filter(Boolean).join('');
    const currentBubble = renderWaBubble(lines, s.live.time);
    return `
      <div class="phone-wrap">
        <div class="phone-mockup">
          <div class="phone-notch"></div>
          <div class="phone-statusbar"><span class="phone-clock">${realTimeLabel()}</span><span>100%</span></div>
          <div class="phone-screen">
            <div class="wa-header">
              <span class="wa-back">&#8249;</span>
              <div class="wa-avatar">${initials}</div>
              <div class="wa-title"><div class="wa-name">${contact}</div><div class="wa-sub">${contactSub}</div></div>
              <div class="wa-header-actions">
                <span class="wa-action">${ICON_WA_VIDEOCALL}</span>
                <span class="wa-action">${ICON_WA_CALL}</span>
              </div>
            </div>
            <div class="wa-body">
              ${priorBubbles}
              ${currentBubble}
            </div>
            <div class="wa-inputbar">
              <div class="wa-input-field">
                <span class="wa-input-icon">${ICON_WA_EMOJI}</span>
                <span class="wa-input-placeholder">Message</span>
                <span class="wa-input-icon">${ICON_WA_ATTACH}</span>
                <span class="wa-input-icon">${ICON_WA_CAMERA_SM}</span>
              </div>
              <span class="wa-input-mic">${ICON_WA_MIC}</span>
            </div>
          </div>
        </div>
      </div>`;
  }
  const dialogue    = lines.filter(l => /:\s/.test(l) && !l.startsWith('['));
  const captions    = dialogue.slice(-2);
  const personaName = state.voice ? state.voice.name : 'Neha';
  const personaInit = personaName.charAt(0).toUpperCase();
  const contactName = s.live.contact || 'Predixion Fincorp';

  // A real call has a genuine dial delay before anything is actually
  // happening — the phone screen used to jump straight to scripted call
  // captions regardless, which read as connected instantly. Only applies
  // when a real call was actually triggered (state.phone set); a mock run
  // keeps the original scripted-only display below. Mirrors the top
  // call-status bar (setCallStatusLine) and Communication History (both
  // driven by the same _voiceCallPhase, set in triggerRealCall /
  // subscribeToCallEvents) so all three never disagree about what's
  // actually happening (2026-09-08 user report).
  let statusHtml;
  let captionsHtml = captions.map(l => `<div class="cap-line">${l}</div>`).join('');
  if(state.phone && _voiceCallPhase === 'connecting'){
    statusHtml = `<span class="dot-pending"></span>Connecting…`;
    captionsHtml = `<div class="cap-line cap-connecting">Dialing ${state.phone}…</div>`;
  } else if(state.phone && _voiceCallPhase === 'live'){
    statusHtml = `<span class="live-blip"></span>${contactName} &middot; <span id="phoneCallTimer">0:00</span>`;
  } else {
    statusHtml = `<span class="live-blip"></span>${contactName} &middot; ${realTimeLabel()}`;
  }

  return `
    <div class="phone-wrap">
      <div class="phone-mockup">
        <div class="phone-notch"></div>
        <div class="phone-statusbar"><span class="phone-clock">${realTimeLabel()}</span><span>100%</span></div>
        <div class="call-screen">
          <div class="call-top">
            <div class="call-avatar">${personaInit}</div>
            <div class="call-name">${personaName}</div>
            <div class="call-status">${statusHtml}</div>
          </div>
          <div class="call-captions">${captionsHtml}</div>
          <div class="call-controls">
            <div class="call-btn">${ICON_MIC}</div>
            <div class="call-btn end">${ICON_HANGUP}</div>
            <div class="call-btn">${ICON_SPEAKER}</div>
          </div>
        </div>
      </div>
    </div>`;
}

function updateDockedPhone(s){
  const titleEl = document.getElementById('phoneDockTitle');
  if(titleEl){
    titleEl.textContent = (s.live.audience === 'agent') ? 'Human agent\u2019s phone' : (s.live.voice ? 'Incoming call' : 'Borrower\u2019s phone');
  }
  const bodyEl = document.getElementById('phoneDockBody');
  if(!bodyEl) return;
  const newHtml = renderPhoneMockup(s);
  // Skip the rebuild entirely when nothing actually changed \u2014 a _voiceCall-
  // Phase refresh (refreshVoiceCallPhone) or a re-render for an unrelated
  // reason can call this with content identical to what's already there,
  // and a full innerHTML replace of identical markup is exactly what read
  // as a "flicker" with no visible reason (2026-09-08 user report).
  // Comparing the raw newHtml string against bodyEl.innerHTML directly is
  // NOT reliable: the browser re-serializes HTML entities when reading
  // .innerHTML back (e.g. the literal "&#8249;" in the template comes back
  // out as the actual "\u2039" character), so an unrelated-looking encoding
  // difference would always register as "changed" even when nothing was.
  // Routing newHtml through the same parse/serialize round-trip (via a
  // detached, unrendered probe element) before comparing cancels that out.
  const probe = document.createElement('div');
  probe.innerHTML = newHtml;
  if(bodyEl.innerHTML === probe.innerHTML) return;
  bodyEl.innerHTML = newHtml;
  // The content genuinely did change here (a new call phase, a new
  // message) \u2014 a instant swap still reads as a jump cut, so fade the new
  // content in rather than popping it in at full opacity.
  bodyEl.classList.remove('phone-content-enter');
  // Reflow so the removed class actually takes effect before re-adding it
  // (re-adding an already-present class is a no-op, the animation wouldn't
  // restart).
  void bodyEl.offsetWidth;
  bodyEl.classList.add('phone-content-enter');
}

// Tracks whether the phone pane has shown any real content yet this run ,
// pure analysis steps (no chat/nba/decision) leave it showing whatever it
// last displayed instead of resetting to idle, like a real phone would.
let _phoneHasContent = false;

// Real-call phase, read by renderPhoneMockup's voice-call branch so the
// phone screen itself shows "Connecting…" during the real dial delay and a
// live ticking timer once actually answered — not just the scripted
// captions regardless of what's really happening (2026-09-08 user report).
// Only meaningful when state.phone is set (a real call was actually
// triggered); a mock/no-phone run keeps the old scripted-only display.
let _voiceCallPhase = 'idle'; // 'idle' | 'connecting' | 'live' | 'ended'

// The phone's own status-bar clock used to be a hardcoded "9:41" — now a
// real, ticking clock like an actual phone. Queries the live DOM each tick
// rather than caching an element reference, since the phone mockup gets
// torn down and rebuilt on step changes; this way the interval keeps
// working across those rebuilds with no extra wiring needed at each one.
setInterval(() => {
  document.querySelectorAll('.phone-statusbar .phone-clock').forEach(el => {
    el.textContent = realTimeLabel();
  });
}, 15000);

// Ideal/idle state, a real phone home screen, not an abstract "loading"
// message: shows the apps that will actually be used (the lender's own
// app, WhatsApp, and the phone dialer), so it reads as a real device
// waiting for something to happen, not a placeholder.
const ICON_PHONE_APP = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
const ICON_WHATSAPP_APP = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const ICON_SMS_APP = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
const ICON_CAMERA_APP = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

function renderPhoneIdle(){
  const titleEl = document.getElementById('phoneDockTitle');
  if(titleEl) titleEl.textContent = 'Borrower\u2019s phone';
  const bodyEl = document.getElementById('phoneDockBody');
  if(!bodyEl) return;
  bodyEl.innerHTML = `
    <div class="phone-wrap">
      <div class="phone-mockup">
        <div class="phone-notch"></div>
        <div class="phone-statusbar"><span class="phone-clock">${realTimeLabel()}</span><span>100%</span></div>
        <div class="phone-home">
          <img class="phone-wallpaper-logo" src="/img/logo-mark.png" alt="">
          <div class="phone-home-time">9:41</div>
          <div class="phone-home-apps">
            <div class="phone-app">
              <div class="phone-app-icon phone">${ICON_PHONE_APP}</div>
              <div class="phone-app-label">Phone</div>
            </div>
            <div class="phone-app">
              <div class="phone-app-icon sms">${ICON_SMS_APP}</div>
              <div class="phone-app-label">Messages</div>
            </div>
            <div class="phone-app">
              <div class="phone-app-icon whatsapp">${ICON_WHATSAPP_APP}</div>
              <div class="phone-app-label">WhatsApp</div>
            </div>
            <div class="phone-app">
              <div class="phone-app-icon camera">${ICON_CAMERA_APP}</div>
              <div class="phone-app-label">Camera</div>
            </div>
            <div class="phone-app">
              <div class="phone-app-icon fincorp"><img src="/img/logo-mark.png" alt=""></div>
              <div class="phone-app-label">Predixion Fincorp</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/* =========================================================
   COMMUNICATION HISTORY -- Segment 1's second column. Accumulates every
   distinct contact event (not just the latest) into a compact log, deduped
   by (time, platform) since several consecutive steps reference the same
   real-world contact attempt (e.g. the voice-call step and the "recalculate
   NBA" step right after it share one call, not two).
========================================================= */
let _lastContactState = null;
let _contactHistory = [];

// The scripted narrative always assumes an outcome (answered, read, etc.)
// so the demo has something to show immediately. Real outcomes — from the
// actual VOIZ call or the actual WhatsApp send — arrive later, async, and
// overwrite the matching entry in place (see markRealCallOutcome /
// markRealWhatsAppOutcome) so the history never keeps claiming a scripted
// guess once the real result is known.
function updateLastContact(s){
  if(s.lastContact){
    _lastContactState = s.lastContact;
    const lc = s.lastContact;
    // Dedupe by key when the scripted entry carries one (see the voice-call
    // step's lastContact) — needed because a real-time update can mutate
    // that entry's `time` away from the scripted probe value, which would
    // otherwise break a plain (time, platform) match on the next re-render.
    // Falls back to (time, platform) for entries with no key (WhatsApp
    // rounds, whose `time` is never rewritten after the fact). Tag the
    // entry with the step that FIRST created it — that's always the same
    // index the real-call/real-WhatsApp triggers fire at, so it's what
    // markRealCallOutcome/markRealWhatsAppOutcome look up later.
    const existing = _contactHistory.find(e =>
      lc.key ? e.key === lc.key : (e.time === lc.time && e.platform === lc.platform));
    if(!existing) _contactHistory.push({ ...lc, stepIdx: idx, real: false });
  }
  renderContactHistory();
}

function renderContactHistory(){
  const emptyEl = document.getElementById('commEmpty');
  const listEl  = document.getElementById('commList');
  if(!listEl) return;

  if(!_contactHistory.length){
    emptyEl.style.display = 'block';
    listEl.innerHTML = '';
    return;
  }
  emptyEl.style.display = 'none';
  listEl.innerHTML = _contactHistory.map(lc => `
      <div class="comm-item">
        <span class="lc-dot ${lc.status}"></span>
        <span class="comm-time">${lc.time}</span>
        <span class="comm-platform ${lc.platform}">${lc.platformLabel}</span>
        <span class="comm-status">${lc.statusLabel}</span>
      </div>`).join('');
}

function realTimeLabel(){
  return new Date().toLocaleTimeString('en-IN', { hour:'numeric', minute:'2-digit', hour12:true }).toUpperCase();
}

// Fires when the real VOIZ call actually completes (see subscribeToCallEvents
// below). Overwrites the scripted voice-call entry with what genuinely
// happened — never leaves the dashboard claiming an answer/no-answer that
// the real call didn't produce.
function markRealCallOutcome(update){
  const entry = _contactHistory.find(e => e.stepIdx === 4);
  if(!entry) return;
  entry.time = realTimeLabel();
  entry.real = true;
  if(update.answered === true){
    entry.status = 'connected';
    entry.statusLabel = 'Connected' + (update.duration ? ` · ${Math.round(update.duration)}s` : '');
  } else if(update.answered === false){
    entry.status = 'not-connected';
    entry.statusLabel = 'Not answered';
  } else {
    entry.statusLabel = 'Call ended, outcome unclear';
  }
  renderContactHistory();
}

// Fires once the /api/whatsapp/send response is back for the matching step.
// Mock mode never actually reaches WhatsApp, so it's labeled as such rather
// than shown as delivered.
function markRealWhatsAppOutcome(stepIdx, { ok, mode, label }){
  const entry = _contactHistory.find(e => e.stepIdx === stepIdx);
  if(!entry) return;
  entry.time = realTimeLabel();
  entry.real = true;
  entry.status = ok && mode === 'live' ? 'connected' : (ok ? 'pending' : 'not-connected');
  entry.statusLabel = label;
  renderContactHistory();
}

// A genuine borrower reply arrived (server/routes/whatsappWebhook.js,
// message.inbound, matched to this case by phone number) — unlike every
// other Communication History entry, which starts as a scripted guess and
// gets overwritten in place, this one has no scripted counterpart to
// overwrite: nothing in the timeline predicts what a real person will type
// back, so it's always a new append-only entry, never a match-and-replace.
function markRealInboundReply(inbound){
  _contactHistory.push({
    time: realTimeLabel(),
    platform: 'whatsapp',
    platformLabel: 'WhatsApp (Borrower reply)',
    status: inbound.triggerMatched ? 'connected' : 'pending',
    statusLabel: inbound.triggerMatched ? inbound.triggerMatched : `"${inbound.text}"`,
    real: true,
  });
  renderContactHistory();
  // Unblocks the bounded real-reply wait (isWaitingOnRealData, idx===7) —
  // only a genuine trigger-word match counts as "the question got answered"
  // (a reply that doesn't match anything doesn't tell the flow what to do
  // next, so it still falls through to the timeout path).
  if(inbound.triggerMatched && whatsappOpenEndedSentAt && !whatsappReplyMatched){
    whatsappReplyMatched = true;
  }
  if (window.track) track('whatsapp_inbound_reply', { text: inbound.text, triggerMatched: inbound.triggerMatched });
}

/* =========================================================
   MAIN RENDER STEP
========================================================= */
function renderStep(instant){
  const s = stepData[idx];
  renderTabs();

  // The bounded real-reply wait (isWaitingOnRealData, idx===7) timed out
  // with nothing received — swap this step's scripted content (which
  // otherwise assumes the reply arrived, e.g. systemic's "SPLIT") for the
  // honest "no reply yet" version. Only steps that actually defined a
  // timeout variant have one (see steps() timeoutLines/timeoutAction/
  // timeoutDetails) — archetypes whose scripted content never assumed a
  // reply in the first place are left untouched.
  if(idx === 8 && whatsappReplyTimedOut && s.timeoutLines){
    s.action = s.timeoutAction;
    s.details = s.timeoutDetails;
    s.live.lines = s.timeoutLines;
  }

  document.getElementById('stepTitle').textContent   = s.title;
  document.getElementById('stepSubtitle').textContent= s.subtitle;
  document.getElementById('actionText').textContent  = s.action;
  document.getElementById('detailsText').textContent = s.details;
  document.getElementById('classValue').textContent  = s.classV;
  document.getElementById('footStep').textContent    = `Step ${idx+1} of ${stepData.length}`;
  document.getElementById('footClass').textContent   = s.classV;

  const badge = document.getElementById('statusBadge');
  badge.classList.remove('done','escalated');
  if(s.status === 'done')      { badge.textContent='RESOLVED';   badge.classList.add('done'); }
  else if(s.status === 'escalated'){ badge.textContent='ESCALATED'; badge.classList.add('escalated'); }
  else                         { badge.textContent='IN PROGRESS'; }

  // Last Contacted card
  updateLastContact(s);

  // Next Best Action — scripted nbaNow guess, only while no real call has
  // supplied the actual recommendation yet (see renderRealCallSummary).
  if(!_nbaIsReal){
    const nbaEl = document.getElementById('nbaPointer');
    if(nbaEl) nbaEl.textContent = s.nbaNow ? s.nbaNow.title : '-';
  }

  // Signals
  document.getElementById('signalsList').innerHTML = s.signals.map(sg=>`
    <div class="signal-item">
      <div class="sig-top"><div class="sig-dot"></div><div class="sig-name">${sg.name}</div><div class="sig-tag">${sg.tag}</div></div>
      <div class="sig-desc">${sg.desc}</div>
    </div>`).join('');

  // Real-call WhatsApp copy override, step 7 ONLY (Round 2, the actual
  // follow-up "carry out the NBA" message Gemini's prompt is written for).
  // Step 9 used to get the exact same override applied to it too — but for
  // technical/systemic (the only archetypes where step 9 isn't the agent-
  // escalation handoff), step 9 is a structurally different CLOSING message
  // (payment confirmation / plan activation), not a second follow-up asking
  // the same thing again. Applying the identical Gemini copy to both steps
  // sent the exact same WhatsApp message out twice in a row (visible as a
  // duplicated bubble on the phone mockup, since step 9 also shows step 7's
  // bubble as prior context right above its own) — see 2026-09-08 user
  // report. Step 9 now always keeps its own scripted, archetype-specific
  // closing text; only step 7 ever gets the real AI-tailored copy.
  // This mutates s.live.lines BEFORE the phone-pane render below AND before
  // the triggerWhatsApp call further down reads the same s.live.lines, so
  // the displayed bubble and the actual send can never disagree. Gated on
  // the step's own one-shot sent-flag so re-visiting step 7 after its
  // message already went out (scripted, because Gemini wasn't ready yet at
  // the time) never repaints the bubble to something that wasn't actually sent.
  if(idx === 7 && !whatsappRound2Sent && s.live.audience !== 'agent'
     && state.geminiAnalysis && state.geminiAnalysis.status === 'ready' && state.geminiAnalysis.whatsappCopy){
    s.live.lines = [state.geminiAnalysis.whatsappCopy];
  }

  // Phone pane (right, persistent), 2026-09-07 redesign: the phone only
  // ever shows actual phone activity (a call or a WhatsApp thread). Next
  // Best Action / decision-engine reasoning is NOT phone content, it
  // already renders into the ACTION/DETAILS boxes above via s.action/
  // s.details (set unconditionally near the top of this function), so
  // 'nba' steps and analysis-only 'terminal' steps just leave the phone
  // showing whatever it last displayed (or the idle home screen, if
  // nothing real has happened yet), exactly like a real phone would.
  //
  // The human-handoff case summary (audience:'agent') is excluded from this
  // too, even though it's structurally a 'chat' step — it's an internal
  // Kollect-to-human-agent alert, not something that ever appears on the
  // BORROWER's phone, and this mockup represents the borrower's phone
  // throughout. Showing it here read as if the borrower could see their own
  // dispute/escalation being discussed about them. Its content already
  // shows in the ACTION/DETAILS boxes above (2026-09-08 user request).
  if(s.live.type === 'chat' && s.live.audience !== 'agent'){
    updateDockedPhone(s);
    _phoneHasContent = true;
  } else if(!_phoneHasContent){
    renderPhoneIdle();
  }

  document.getElementById('btnPrev').style.opacity = idx===0 ? .35 : 1;
  document.getElementById('btnNext').style.opacity = idx===stepData.length-1 ? .35 : 1;

  // Real call trigger — fires once, at voice-agent step
  if(idx === 4 && state.phone && !realCallTriggered){
    realCallTriggered = true;
    triggerRealCall();
  }

  // Real WhatsApp sends — fire once each, at the matching scripted step,
  // sending EXACTLY the text already shown in the chat bubble (s.live.lines
  // joined) so what the attendee sees on screen is what actually goes out,
  // whichever of the 4 archetypes is running. Stays a no-op cost-wise until
  // live mode is switched on (see the WhatsApp mode toggle in the topbar).
  if(idx === 3 && state.phone && !whatsappRound1Sent){
    whatsappRound1Sent = true;
    triggerWhatsApp('paymentReminder', s.live.lines.join('\n'), 3);
  }
  if(idx === 7 && state.phone && !whatsappRound2Sent){
    whatsappRound2Sent = true;
    triggerWhatsApp('followup', s.live.lines.join('\n'), 7);
    // Starts the bounded real-reply wait (isWaitingOnRealData) only when
    // this specific message actually asked one (see expectsReply, steps()).
    if(s.expectsReply) whatsappOpenEndedSentAt = Date.now();
  }
  if(idx === 9 && state.phone && !whatsappEscalationSent){
    whatsappEscalationSent = true;
    const templateKey = s.live.audience === 'agent' ? 'escalation' : 'followup';
    triggerWhatsApp(templateKey, s.live.lines.join('\n'), 9);
  }
}

/* =========================================================
   PLAYBACK CONTROLS
========================================================= */
document.getElementById('btnNext').addEventListener('click', () => {
  if(idx < stepData.length-1){
    const s = stepData[idx + 1];
    if (window.track) track('dashboard_step', { action: 'next', fromStep: idx, toStep: idx + 1, toStepLabel: s ? s.pill + ' · ' + s.title : '' });
    goToStep(idx+1);
  }
});
document.getElementById('btnPrev').addEventListener('click', () => {
  if(idx > 0){
    const s = stepData[idx - 1];
    if (window.track) track('dashboard_step', { action: 'prev', fromStep: idx, toStep: idx - 1, toStepLabel: s ? s.pill + ' · ' + s.title : '' });
    goToStep(idx-1);
  }
});
document.getElementById('btnReset').addEventListener('click', () => {
  if (window.track) track('dashboard_reset', {});
  stopPlay(); goToStep(0); startIngestion();
});
const btnPlay = document.getElementById('btnPlay');
btnPlay.addEventListener('click', () => {
  if(playTimer){ stopPlay(); } else { startPlay(); }
});
// Auto-play must not rush past a real call, its analysis, or a real reply
// it's genuinely waiting on — it waits for the real thing to actually
// finish. Manual next/prev (above) always works regardless; this only
// gates the automatic advance. Steps 4 (voice call), 5 (call analysis,
// "Step 6/13") and 7 (Round 2 WhatsApp, only when it asked a question) are
// the only ones that ever wait on real backend work; everything else
// advances as before.
function isWaitingOnRealData(){
  if(!state.phone) return false; // mock/simulated run, nothing real to wait for
  if(idx === 4) return !realCallCompleted;
  if(idx === 5){
    if(!realCallCompleted) return true;
    if(!realCallAnswered) return false; // no-answer/failed calls have no transcript to analyze
    const status = state.geminiAnalysis && state.geminiAnalysis.status;
    return status !== 'ready' && status !== 'unavailable';
  }
  if(idx === 7 && stepData[7] && stepData[7].expectsReply && whatsappOpenEndedSentAt && !whatsappReplyMatched){
    if(Date.now() - whatsappOpenEndedSentAt < REPLY_WAIT_MS) return true;
    // Bound hit with nothing received — stop waiting for good (checked
    // once, not re-armed) and let step 9's render pick up whatsappReplyTimedOut.
    whatsappReplyTimedOut = true;
    return false;
  }
  return false;
}
function startPlay(){
  if (window.track) track('dashboard_play_toggled', { playing: true });
  btnPlay.classList.add('play-active');
  btnPlay.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
  playTimer = setInterval(() => {
    if(isWaitingOnRealData()) return; // stay put until the real call/analysis actually finishes
    if(idx < stepData.length-1){ goToStep(idx+1); }
    else { stopPlay(); }
  }, 3400);
}
function stopPlay(){
  if (playTimer && window.track) track('dashboard_play_toggled', { playing: false });
  clearInterval(playTimer);
  playTimer = null;
  btnPlay.classList.remove('play-active');
  btnPlay.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
}

/* =========================================================
   REAL CALL — backend proxy at /api/call (no keys here)
========================================================= */
function setCallStatusLine(text, mode){
  const el     = document.getElementById('realCallStatus');
  const textEl = document.getElementById('realCallStatusText');
  if(!el || !textEl) return;
  textEl.textContent = text;
  el.className = 'call-status-line' + (mode ? ` ${mode}` : '');
  el.style.display = 'flex';
}

// Live elapsed-call timer — ticks from the moment the call actually goes
// live (VOIZ status 'initiated', see subscribeToCallEvents below), not from
// whenever the dashboard happened to render the voice-call step. Drives
// both the tiny readout next to "Call in progress…" and the Communication
// History entry's duration, so neither ever shows a guessed duration while
// the real call is still ongoing.
let _callTimerInterval = null;
function formatElapsed(ms){
  const secs = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}
function startCallTimer(startedAtMs){
  stopCallTimer();
  const timerEl = document.getElementById('realCallStatusTimer');
  if(timerEl) timerEl.style.display = 'inline';
  const tick = () => {
    const label = formatElapsed(Date.now() - startedAtMs);
    if(timerEl) timerEl.textContent = label;
    // Queried fresh every tick, not cached like timerEl above — the phone
    // mockup's own #phoneCallTimer lives inside phoneDockBody, which gets
    // torn down and rebuilt by refreshVoiceCallPhone() at the
    // connecting->live transition, so a reference taken before that
    // transition would point at a now-detached element.
    const phoneTimerEl = document.getElementById('phoneCallTimer');
    if(phoneTimerEl) phoneTimerEl.textContent = label;
    const entry = _contactHistory.find(e => e.stepIdx === 4);
    // Guard on !entry.real: once the call actually completes,
    // markRealCallOutcome has already written the real final duration —
    // a late-firing tick (interval hasn't been cleared yet) must not
    // overwrite that with a slightly-stale "still counting" value.
    if(entry && !entry.real){
      entry.statusLabel = `Connected · ${label}`;
      renderContactHistory();
    }
  };
  tick();
  _callTimerInterval = setInterval(tick, 1000);
}
function stopCallTimer(){
  if(_callTimerInterval){ clearInterval(_callTimerInterval); _callTimerInterval = null; }
  const timerEl = document.getElementById('realCallStatusTimer');
  if(timerEl) timerEl.style.display = 'none';
}

// Re-renders the phone mockup only if the voice-call step (index 4) is the
// one currently on screen \u2014 a _voiceCallPhase transition that happens while
// the attendee has already moved on to a later step must not yank the
// phone back to showing the call screen.
function refreshVoiceCallPhone(){
  if(idx === 4 && stepData[4]) updateDockedPhone(stepData[4]);
}

async function triggerRealCall(){
  setCallStatusLine('Dialing your number\u2026');
  _voiceCallPhase = 'connecting';
  refreshVoiceCallPhone();
  try {
    const callBody = {
        name: state.name,
        phone: state.phone,
        voiceId: state.voice ? state.voice.id : null,
        lang: personaLang(),
        // The first WhatsApp message (step 3) already went out before this
        // call — hand it to the server so a no-answer follow-up (see
        // callOutcome.js) reads as a continuation of that thread, not a
        // restart. stepData[3] is always populated by here regardless of
        // which step is currently showing.
        firstMessage: (stepData[3] && stepData[3].live.lines || []).filter(l => l.trim()).join('\n'),
        // Forwarded to VOIZ as extra customer_data context (server/routes/
        // call.js) — has no effect on the live call today (the registered
        // agent's prompt doesn't reference these), but is ready for the
        // moment it does.
        archetypeId: state.archetype ? state.archetype.id : null,
        overdueDays: state.archetype ? state.archetype.overdueDays : null,
        // Routes the real call through ElevenLabs instead of VOIZ — only
        // takes effect server-side if ElevenLabs is actually configured
        // (falls back to VOIZ transparently otherwise, see call.js).
        enhancedQuality: !!state.enhancedQuality,
        // 'collections' (default) or 'sales' — picked on screen-usecase.
        // Sales routes to a completely different Sarvam agent server-side
        // and has NO fallback to VOIZ/ElevenLabs if it fails (call.js).
        useCase: state.useCase || 'collections',
    };
    const postCall = (extra) => fetch('/api/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...callBody, ...extra }),
    });
    let res = await postCall({});
    let data = await res.json();
    // The server answers 409 instead of silently dialing VOIZ (a different
    // agent and script) when the primary agent couldn't place the call —
    // ask first, and only retry through the backup if the attendee agrees.
    if(res.status === 409 && data.needsFallbackConfirm){
      const ok = window.confirm('The primary voice agent could not place this call. Place it through the backup agent instead? It uses a different voice and script.');
      if(ok){
        setCallStatusLine('Dialing through the backup agent…');
        res = await postCall({ allowFallback: true });
        data = await res.json();
      } else {
        setCallStatusLine('Call not placed (backup agent declined)', 'err');
        realCallCompleted = true;
        return;
      }
    }
    if(!res.ok){
      setCallStatusLine(`Call could not be placed (${data.error || res.status})`, 'err');
      realCallCompleted = true; // nothing to wait for, unblock auto-play
      return;
    }
    state.callId = data.call_id;
    if (window.track) track('call_triggered', { callId: data.call_id, status: data.status, voiceId: state.voice ? state.voice.id : null });
    if(data.status === 'queued'){
      setCallStatusLine('Booth is at capacity, your call is queued and will dial shortly.');
    } else {
      setCallStatusLine('Call connecting\u2026', 'live');
    }
    subscribeToCallEvents(data.call_id);
  } catch(err){
    console.error(err);
    setCallStatusLine('Could not reach the call backend.', 'err');
    realCallCompleted = true; // nothing to wait for, unblock auto-play
  }
}

/* =========================================================
   REAL WHATSAPP — backend proxy at /api/whatsapp/send (no keys here)
========================================================= */
async function triggerWhatsApp(templateKey, message, stepIdx){
  try {
    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateKey, name: state.name, phone: state.phone, message }),
    });
    const data = await res.json();
    if(!res.ok){
      console.warn('[whatsapp]', templateKey, 'failed:', data.error || res.status);
      markRealWhatsAppOutcome(stepIdx, { ok:false, label:`Failed: ${data.error || res.status}` });
      return;
    }
    console.log('[whatsapp]', templateKey, data.status, `(${data.mode})`);
    // Determine round number from templateKey
    const round = templateKey === 'paymentReminder' ? 1 : 2;
    if (window.track) track('whatsapp_sent', { round, templateKey, mode: data.mode || 'sent' });
    // Honest status: mock mode never actually reaches WhatsApp, and a
    // rate-limited/blocked send didn't go out either — both get labeled
    // as such rather than shown as delivered.
    markRealWhatsAppOutcome(stepIdx, {
      ok: data.status === 'sent',
      mode: data.mode,
      label: data.status === 'blocked' ? `Blocked: ${data.reason || 'rate limit'}`
        : data.mode === 'mock' ? 'Not sent (mock mode)'
        : 'Sent live',
    });
  } catch(err){
    console.warn('[whatsapp]', templateKey, 'request failed:', err);
    markRealWhatsAppOutcome(stepIdx, { ok:false, label:'Network error' });
  }
}

// The SSE connection used to close the instant `completed` arrived, which
// meant geminiAnalysis, arriving as a second store.updateCase a beat later,
// over the SAME bus event, could never reach the browser (see
// implementation_plan.md, "A real blocker found while planning this").
// Fix: stay open through a first `completed` wave with no geminiAnalysis
// yet, close only once it lands or a 5s ceiling is hit.
function subscribeToCallEvents(callId){
  const source = new EventSource(`/api/call/${callId}/events`);
  let analysisTimer = null;
  let outcomeTracked = false;
  let lastRenderedInboundAt = null;
  let inboundWindowTimer = null;
  let callLiveStarted = false;
  let guessedConnectTimer = null;
  // Safety ceiling matching server/lib/callPoller.js's own MAX_POLL_MS (3
  // minutes) plus buffer — if a 'completed' event genuinely never arrives
  // (VOIZ dropped it, dispatch got stuck), auto-play must not wait forever.
  const giveUpTimer = setTimeout(() => { realCallCompleted = true; }, 3.5 * 60 * 1000);
  source.onmessage = (evt) => {
    const update = JSON.parse(evt.data);
    // A real inbound WhatsApp reply (server/routes/whatsappWebhook.js) can
    // land minutes after the call itself completes — this check runs on
    // every SSE wave regardless of call status, so a reply is never missed
    // just because it arrived before or long after the 'completed' branch's
    // own one-time work below.
    if(update.realInboundLatest && update.realInboundLatest.receivedAt !== lastRenderedInboundAt){
      lastRenderedInboundAt = update.realInboundLatest.receivedAt;
      markRealInboundReply(update.realInboundLatest);
    }
    if(update.status === 'initiated'){
      // VOIZ has no real "picked up" event \u2014 'initiated' only means the
      // call was dispatched to the phone network, not that a human
      // answered (that's only ever revealed after the fact, inside the
      // terminal 'completed' record's answered flag). Claiming "Connected"
      // right here was a real bug (2026-09-08 user report). This waits a
      // guessed 9s (raised from an initial 5s guess, same day) \u2014 a rough
      // estimate of how long dispatch-to-actually-ringing takes \u2014 before
      // showing "Connected", instead of claiming it the instant the call
      // was merely dispatched. It's still a guess, not a real signal;
      // markRealCallOutcome below always corrects this to the true
      // answered/not-answered outcome once the call actually ends.
      setCallStatusLine('Ringing\u2026', 'live');
      if(!callLiveStarted && !guessedConnectTimer){
        guessedConnectTimer = setTimeout(() => {
          callLiveStarted = true;
          setCallStatusLine('Call in progress\u2026', 'live');
          const entry = _contactHistory.find(e => e.stepIdx === 4);
          if(entry && !entry.real){
            entry.time = realTimeLabel();
            entry.status = 'connected';
          }
          _voiceCallPhase = 'live';
          refreshVoiceCallPhone();
          startCallTimer(Date.now());
        }, 9000);
      }
    }
    if(update.status === 'queued')    setCallStatusLine('Queued, waiting for a free line\u2026');
    if(update.status === 'completed'){
      // A call that ends within the 5s guess window (near-instant failure,
      // voicemail, etc.) must never flip to "Connected" after the fact \u2014
      // cancel the guess if it hasn't fired yet.
      if(guessedConnectTimer && !callLiveStarted){
        clearTimeout(guessedConnectTimer);
        guessedConnectTimer = null;
      }
      stopCallTimer();
      _voiceCallPhase = 'ended';
      refreshVoiceCallPhone();
      // No single "disposition" field exists (confirmed against the real
      // API), outcome comes from separate boolean flags instead.
      const outcome = update.escalation_flag || update.dispute_flag ? 'escalated'
        : update.call_success ? 'resolved'
        : 'completed';
      setCallStatusLine(`Call completed, ${outcome}`, 'live');
      renderRealCallSummary(update);
      markRealCallOutcome(update);
      // Unblocks the auto-play pause below the instant the real call is
      // actually done (this fires once per call; later waves for
      // geminiAnalysis re-set the same values, harmless).
      clearTimeout(giveUpTimer);
      realCallCompleted = true;
      realCallAnswered = update.answered === true;
      if(!outcomeTracked){
        outcomeTracked = true;
        if (window.track) track('call_outcome', {
          callId:             state.callId,
          call_success:       update.call_success,
          customer_sentiment: update.customer_sentiment,
          escalation_flag:    update.escalation_flag,
          dispute_flag:       update.dispute_flag,
          ptp_flag:           update.ptp_flag,
          next_best_action:   update.next_best_action,
        });
      }

      // geminiAnalysis streams in field-by-field now — 'streaming' is not a
      // terminal state, so keep the connection open and keep re-rendering
      // on every wave. Only 'ready'/'unavailable' close it.
      const analysisStatus = update.geminiAnalysis && update.geminiAnalysis.status;
      const analysisDone = analysisStatus === 'ready' || analysisStatus === 'unavailable';

      if(!analysisTimer && !analysisDone){
        setAnalysisPending();
        // Stays comfortably above geminiClient's own 8s timeout (server/lib/
        // geminiClient.js) so the client never gives up before the server
        // could still have succeeded — a real call hit exactly that gap
        // when this was 5s against a 4s server timeout.
        analysisTimer = setTimeout(() => source.close(), 10000);
      }
      if(update.geminiAnalysis) renderGeminiAnalysis(update.geminiAnalysis);
      if(analysisDone){
        clearTimeout(analysisTimer);
        // Used to close the connection right here. Doesn't anymore — a real
        // inbound WhatsApp reply (server/routes/whatsappWebhook.js) can
        // arrive minutes after the call and analysis are both done, and
        // that's exactly what markRealInboundReply above is waiting for.
        // Instead, stay open until the longer inboundWindowTimer below
        // gives up, matching how long a booth visitor might plausibly still
        // be standing at the booth re-reading their phone.
        if(!inboundWindowTimer){
          inboundWindowTimer = setTimeout(() => source.close(), 10 * 60 * 1000);
        }
      }
    }
  };
  source.onerror = () => { /* SSE will auto-retry */ };
}

/* =========================================================
   REAL CALL TRANSCRIPT & OUTCOME, real data from GET /calls/{id}
   polling (server/lib/callPoller.js), not the scripted narrative.
   Hidden until a call actually completes.
========================================================= */
function renderRealCallSummary(update){
  const card         = document.getElementById('realTranscriptCard');
  const outcomeEl    = document.getElementById('rtOutcome');
  const transcriptEl = document.getElementById('rtTranscript');
  if(!card || !outcomeEl || !transcriptEl) return;

  const badges = [];
  if(update.escalation_flag || update.dispute_flag){
    badges.push(['escalated', update.dispute_flag ? 'Dispute' : 'Escalated']);
  } else if(update.call_success === true){
    badges.push(['resolved', 'Resolved']);
  } else if(update.call_success === false){
    badges.push(['neutral', 'Not resolved']);
  }
  if(update.customer_sentiment) badges.push(['neutral', `Sentiment: ${update.customer_sentiment}`]);
  if(update.ptp_flag)           badges.push(['resolved', 'Promise to pay']);
  // Sarvam's call_end_reason is a raw enum (e.g. "NO_FAILURE_REASON",
  // "USER_ENDS") rather than a human phrase like VOIZ's — prettify only the
  // SCREAMING_SNAKE_CASE shape so VOIZ's own already-readable values pass
  // through untouched.
  if(!badges.length){
    const reason = update.call_end_reason;
    const pretty = reason && /^[A-Z0-9_]+$/.test(reason)
      ? reason.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')
      : reason;
    badges.push(['neutral', pretty || 'Call ended']);
  }

  outcomeEl.innerHTML = badges.map(([cls, label]) =>
    `<span class="rt-badge ${cls}">${label}</span>`).join('');

  if(update.transcript){
    transcriptEl.innerHTML = update.transcript.split('\n').map(line => {
      const isAgent = line.startsWith('agent:');
      const cls = isAgent ? 'rt-line-agent' : 'rt-line-customer';
      return `<div class="${cls}">${line.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>`;
    }).join('');
  } else {
    transcriptEl.textContent = 'No transcript available for this call.';
  }

  // Summary — a real one-liner from the actual call, not scripted copy.
  // No scripted fallback exists for this (there's nothing to show before a
  // real call happens), so it stays "—" until real data lands.
  const summaryEl = document.getElementById('summaryPointer');
  if(summaryEl){
    const bits = [];
    if(update.dispute_description) bits.push(update.dispute_description);
    if(update.customer_sentiment)  bits.push(`Sentiment: ${update.customer_sentiment}`);
    if(typeof update.call_success === 'boolean') bits.push(update.call_success ? 'Call succeeded' : 'Call did not resolve the case');
    if(bits.length){
      summaryEl.textContent = bits.join(' · ');
      _summaryIsReal = true;
    }
  }

  // Next Best Action — real overrides the scripted nbaNow guess the moment
  // the actual call tells us what it recommends.
  if(update.next_best_action){
    const nbaEl = document.getElementById('nbaPointer');
    if(nbaEl){
      nbaEl.textContent = update.next_best_action;
      _nbaIsReal = true;
    }
  }
}

/* =========================================================
   GEMINI POST-CALL INTELLIGENCE — real-call path only. VOIZ's own
   customer_sentiment/next_best_action/dispute_description come back null
   on every real call this project has inspected (docs/VOIZ_API_REFERENCE.md),
   so renderRealCallSummary above never has anything to show for them. This
   is the fallback that fills those same slots — never a second, competing
   set of fields. See implementation_plan.md.
========================================================= */
// One line of plain-English explanation, shown inside the Call Transcript
// card (never a separate/bigger overlay — 2026-09-08 user request) between
// the real call ending and analysis finishing. Each phrase names what's
// genuinely happening right now and, implicitly, why it takes a moment —
// not jargon, and not a blind timed loop: advanceAnalysisStage (below)
// only moves to the next phrase once its real field has actually streamed
// back from GLM/Gemini.
const ANALYSIS_STAGE_COPY = [
  'Reading the call to understand what happened…',
  'Picked up the tone — working out what it means for this case…',
  'Outcome summarized — deciding the next best action…',
  'Wrapping up the recommendation…',
];
function setAnalysisStageText(text){
  const textEl = document.getElementById('analysisStageText');
  if(!textEl || textEl.textContent === text) return;
  textEl.textContent = text;
  textEl.classList.remove('stage-text-enter');
  void textEl.offsetWidth; // restart the fade even if the same class was just removed
  textEl.classList.add('stage-text-enter');
}
function setAnalysisPending(){
  const line = document.getElementById('analysisStageLine');
  if(!line) return;
  line.style.display = 'flex';
  setAnalysisStageText(ANALYSIS_STAGE_COPY[0]);
}

// Advances to the next real phrase only once its field has actually
// streamed in — the phrase order matches the wire format's own real
// arrival order (server/lib/geminiClient.js FIELD_MAP: SENTIMENT, SUMMARY,
// NBA), not a guessed or decorative sequence. Hides the whole line once
// status leaves 'streaming' — real content is on screen by then
// (summaryPointer/nbaPointer/rt-outcome badges).
function advanceAnalysisStage(analysis){
  const line = document.getElementById('analysisStageLine');
  if(!line) return;
  if(analysis.status !== 'streaming'){
    line.style.display = 'none';
    return;
  }
  // One real field in = one phrase forward, so every phrase actually gets
  // shown in turn (a baseline "always true" entry here would make the
  // first field received jump two phrases at once instead of one).
  const fieldsIn = [analysis.sentiment, analysis.summary, analysis.nextBestAction].filter(Boolean).length;
  setAnalysisStageText(ANALYSIS_STAGE_COPY[Math.min(fieldsIn, ANALYSIS_STAGE_COPY.length - 1)]);
}

// Called once per wave — 'streaming' (0 or more times, each with whatever
// new fields just finished generating), then exactly one terminal 'ready'
// or 'unavailable'. Must be safe to call repeatedly with partial data:
// every field write is idempotent (checks it hasn't already gone real
// before writing) and every badge insert is guarded against duplicating on
// the next wave.
function renderGeminiAnalysis(analysis){
  if(!analysis) return;

  advanceAnalysisStage(analysis);

  // Sentiment badge — insert once, the moment it first arrives (usually the
  // first field to stream in, well before summary/NBA finish).
  if(analysis.sentiment && !document.getElementById('aiSentimentBadge')){
    const outcomeEl = document.getElementById('rtOutcome');
    if(outcomeEl){
      outcomeEl.insertAdjacentHTML('beforeend',
        `<span class="rt-badge neutral" id="aiSentimentBadge">${analysis.sentiment}</span>`);
    }
  }

  if(!_summaryIsReal && analysis.summary){
    const summaryEl = document.getElementById('summaryPointer');
    if(summaryEl){
      summaryEl.textContent = analysis.summary;
      _summaryIsReal = true;
    }
  }

  // The NBA pointer only ever gets replaced by a real transcript-backed
  // read (hasTranscript===true, set server-side in callOutcome.js from
  // a.answered). A no-answer/cut call has no real conversation to reason
  // from — its sentiment/summary/WhatsApp copy above are still genuine
  // (they're honest about "no reply happened"), but the NBA stays the
  // templated per-archetype guess (s.nbaNow.title) rather than showing an
  // AI-invented recommendation with nothing behind it.
  if(!_nbaIsReal && analysis.hasTranscript && analysis.nextBestAction){
    const nbaEl = document.getElementById('nbaPointer');
    if(nbaEl){
      nbaEl.textContent = analysis.nextBestAction;
      _nbaIsReal = true;
    }
  }

  // Why the AI picked this action, not just what it is — the "re-strategy"
  // moment made visible. Only shown once the real NBA itself has landed
  // (a reason with no action to attach to reads as orphaned).
  if(_nbaIsReal && analysis.nextBestActionReason){
    const reasonEl = document.getElementById('nbaReason');
    if(reasonEl && !reasonEl.textContent) reasonEl.textContent = analysis.nextBestActionReason;
  }

  if(analysis.status === 'streaming'){
    state.geminiAnalysis = analysis; // whatsappCopy may already be usable before the stream fully ends
    return;
  }

  // 'unavailable': real VOIZ data (transcript, duration, connection status)
  // is already on screen and stays exactly as it is. Never falls back to
  // scripted archetype text for a call that genuinely happened.
  if(analysis.status !== 'ready') return;

  state.geminiAnalysis = analysis; // read by the WhatsApp-copy override in renderStep (steps 7/9)
}

/* =========================================================
   LIGHT/DARK THEME TOGGLE — dashboard screen only (2026-09-08 decision).
   Every other screen and the phone mockup inside this one stay dark
   always — see the #screen-dash[data-theme="light"] rule in styles.css.
   Starts dark on a fresh visit; a manual toggle is remembered per browser.
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnThemeToggle');
  const dashEl = document.getElementById('screen-dash');
  if(!btn || !dashEl) return;

  function applyTheme(theme){
    if(theme === 'light') dashEl.setAttribute('data-theme', 'light');
    else dashEl.removeAttribute('data-theme');
  }

  const saved = localStorage.getItem('kollect_theme');
  if(saved === 'light') applyTheme('light'); // default stays dark otherwise

  btn.addEventListener('click', () => {
    const next = dashEl.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('kollect_theme', next);
    if (window.track) track('theme_toggled', { theme: next });
  });
});

/* =========================================================
   WHATSAPP MOCK/LIVE TOGGLE — /api/whatsapp/mode
   Runtime-only (see server/lib/whatsappModeState.js) — lets you flip real
   sends on/off while testing the dashboard without touching .env or
   restarting the server. Always reverts to .env's value on restart.
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnWhatsappModeToggle');
  if(!btn) return;

  function render(mode){
    btn.textContent = `\u{1F4F1} WhatsApp: ${mode === 'live' ? 'LIVE' : 'MOCK'}`;
    btn.classList.toggle('whatsapp-live-armed', mode === 'live');
  }

  async function fetchMode(){
    try {
      const res = await fetch('/api/whatsapp/mode');
      const data = await res.json();
      render(data.mode);
    } catch(err){
      btn.textContent = '\u{1F4F1} WhatsApp: ?';
      console.warn('[whatsapp mode] fetch failed', err);
    }
  }

  btn.addEventListener('click', async () => {
    const wantsLive = !btn.classList.contains('whatsapp-live-armed');
    if(wantsLive && !confirm('Switch WhatsApp sends to LIVE? Real messages will be sent and may cost money. Continue?')){
      return;
    }
    try {
      const res = await fetch('/api/whatsapp/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: wantsLive ? 'live' : 'mock' }),
      });
      const data = await res.json();
      if(!res.ok){ console.warn('[whatsapp mode] toggle failed', data.error); return; }
      render(data.mode);
      if (window.track) track('whatsapp_toggle', { newMode: data.mode });
    } catch(err){
      console.warn('[whatsapp mode] toggle request failed', err);
    }
  });

  fetchMode();
});

/* =========================================================
   ENHANCED QUALITY TOGGLE — client-side only, no server round-trip.
   Unlike the WhatsApp mode toggle above, this is a per-attendee call
   preference (state.enhancedQuality), not a global server behavior, so it
   just flips the same flag the capture-screen checkbox sets — whichever
   was touched last wins. Read once by triggerRealCall() when the next real
   call actually gets placed; server/routes/call.js decides there whether
   ElevenLabs is actually configured to honor it (falls back to VOIZ
   transparently if not — see elevenLabsClient.js).
========================================================= */
// Exposed at top level (not trapped in the DOMContentLoaded closure) so
// startDash() can re-sync the button's display — DOMContentLoaded fires
// once at page load, well before the capture-screen checkbox (or a later
// click) ever changes state.enhancedQuality, so relying on it alone left
// the button stuck showing "OFF" even when the attendee had opted in
// (2026-09-08 bug found while testing).
function renderEnhancedQualityToggle(){
  const btn = document.getElementById('btnEnhancedQualityToggle');
  if(!btn) return;
  btn.textContent = `\u{1F3A7} Enhanced Quality: ${state.enhancedQuality ? 'ON' : 'OFF'}`;
  btn.classList.toggle('enhanced-quality-armed', state.enhancedQuality);
}
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnEnhancedQualityToggle');
  if(!btn) return;
  btn.addEventListener('click', () => {
    state.enhancedQuality = !state.enhancedQuality;
    const enhancedQualityBox = document.getElementById('enhancedQualityBox');
    if(enhancedQualityBox) enhancedQualityBox.checked = state.enhancedQuality; // keep the capture-screen checkbox in sync if the attendee goes back
    renderEnhancedQualityToggle();
    if (window.track) track('enhanced_quality_toggle', { enhancedQuality: state.enhancedQuality });
  });
  renderEnhancedQualityToggle();
});

/* =========================================================
   DIRECT CALL TRIGGER MODAL — /api/call-direct
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const modal        = document.getElementById('directCallModal');
  const btnOpen      = document.getElementById('btnOpenDirectCallModal');
  const btnClose     = document.getElementById('btnCloseDirectCallModal');
  const btnSend      = document.getElementById('btnSendDirectCall');
  const dcPhone      = document.getElementById('dcPhone');
  const dcName       = document.getElementById('dcName');
  const dcAgentId    = document.getElementById('dcAgentId');
  const dcSipId      = document.getElementById('dcSipId');
  const dcAmount     = document.getElementById('dcAmount');
  const dcDate       = document.getElementById('dcDate');
  const previewEl    = document.getElementById('dcPayloadPreview');
  const resultBox    = document.getElementById('dcResultBox');
  const resultStatus = document.getElementById('dcResultStatus');
  const resultDetails= document.getElementById('dcResultDetails');

  function updatePreview(){
    if(!previewEl) return;
    let phone = (dcPhone.value || '').trim();
    if(phone && !phone.startsWith('+')) phone = '+91' + phone;
    const payload = {
      customer_phone: phone,
      sip_id: (dcSipId.value || '').trim(),
      customer_data: {
        name: (dcName.value || '').trim(),
        customer_name: (dcName.value || '').trim(),
        due_amount: (dcAmount.value || '').trim(),
        due_date: (dcDate.value || '').trim(),
      }
    };
    previewEl.textContent = JSON.stringify(payload, null, 2);
  }

  if(btnOpen){
    btnOpen.addEventListener('click', () => {
      if(state.phone) dcPhone.value = state.phone;
      if(state.name)  dcName.value  = state.name;
      updatePreview();
      if (window.track) track('direct_call_modal_opened', {});
      modal.style.display = 'flex';
    });
  }
  if(btnClose){ btnClose.addEventListener('click', () => { modal.style.display = 'none'; }); }
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });
  [dcPhone, dcName, dcAgentId, dcSipId, dcAmount, dcDate].forEach(el => {
    if(el){ el.addEventListener('input', updatePreview); el.addEventListener('change', updatePreview); }
  });

  const dcGrid = dcPhone ? dcPhone.closest('.dc-grid') : null;
  const batchCtl = dcGrid ? CallBatch.attach(dcName, dcPhone, { toggleBefore: dcGrid, extrasAfter: dcGrid }) : null;

  // Batch: one /api/call-direct dispatch per person, everything else in the
  // form (agent, SIP trunk, amount, date) shared across them.
  async function dispatchBatch(){
    const entries = batchCtl.entries();
    const problem = CallBatch.validate(entries);
    resultBox.style.display = 'block';
    if(problem){
      resultStatus.className = 'rh err';
      resultStatus.textContent = 'CHECK THE LIST';
      resultDetails.textContent = problem;
      return;
    }
    btnSend.disabled = true;
    resultStatus.className = 'rh';
    resultStatus.textContent = `STATUS: DISPATCHING ${entries.length} CALLS...`;
    resultDetails.textContent = '';
    try {
      const outcome = await CallBatch.run(entries, async (e) => {
        const res = await fetch('/api/call-direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: dcAgentId.value,
            customerPhone: e.phone,
            customerName: e.name,
            sipId: dcSipId.value,
            dueAmount: dcAmount.value,
            dueDate: dcDate.value,
          }),
        });
        const data = await res.json().catch(() => ({}));
        return res.ok ? { ok: true } : { ok: false, error: data.error || `HTTP ${res.status}` };
      }, (done, total) => { resultStatus.textContent = `STATUS: DISPATCHED ${done} OF ${total}...`; });
      resultStatus.className = 'rh' + (outcome.failed.length ? ' err' : '');
      resultStatus.textContent = outcome.failed.length ? 'PARTIALLY DISPATCHED' : 'ALL CALLS DISPATCHED';
      resultDetails.textContent = CallBatch.summarize(outcome);
    } finally {
      btnSend.disabled = false;
    }
  }

  if(btnSend){
    btnSend.addEventListener('click', async () => {
      if(batchCtl && batchCtl.isBatch()) return dispatchBatch();
      btnSend.disabled = true;
      btnSend.textContent = '\u23f3 Dispatching Call via VOIZ API...';
      resultBox.style.display = 'block';
      resultStatus.className = 'rh';
      resultStatus.textContent = 'STATUS: DISPATCHING...';
      resultDetails.textContent = 'Sending payload to VOIZ backend...';
      try {
        const payload = {
          agentId: dcAgentId.value,
          customerPhone: dcPhone.value,
          customerName: dcName.value,
          sipId: dcSipId.value,
          dueAmount: dcAmount.value,
          dueDate: dcDate.value,
        };
        const res  = await fetch('/api/call-direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if(res.ok){
          resultStatus.className  = 'rh';
          resultStatus.textContent= `SUCCESS (HTTP ${data.httpStatus || 200}), Status: ${data.status}`;
          resultDetails.textContent = JSON.stringify({
            call_id: data.call_id,
            status: data.status,
            room_name: data.voizResponse?.room_name,
            voizResponse: data.voizResponse,
          }, null, 2);
          setCallStatusLine(`Direct call connected to ${dcPhone.value} (Room: ${data.voizResponse?.room_name || 'active'})`, 'live');
          if(data.call_id) subscribeToCallEvents(data.call_id);
        } else {
          resultStatus.className  = 'rh err';
          resultStatus.textContent= `FAILED (HTTP ${res.status})`;
          resultDetails.textContent = JSON.stringify(data, null, 2);
          setCallStatusLine(`Call failed: ${data.error || res.status}`, 'err');
        }
      } catch(err){
        resultStatus.className  = 'rh err';
        resultStatus.textContent= 'ERROR';
        resultDetails.textContent = String(err);
        setCallStatusLine('Network / Dispatch error', 'err');
      } finally {
        btnSend.disabled = false;
        btnSend.textContent = '\u26a1 Dispatch Call Now via VOIZ API';
      }
    });
  }
});

/* =========================================================
   DETAILS EXPAND MODAL, the compact DETAILS box in the
   action-details row got shorter to make room for the phone
   mockup; clicking it opens the same text large and readable
   instead of losing it to the smaller box.
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const box       = document.getElementById('detailsBox');
  const modal     = document.getElementById('detailsModal');
  const btnClose  = document.getElementById('btnCloseDetailsModal');
  const modalText = document.getElementById('detailsModalText');
  const modalStep = document.getElementById('detailsModalStep');
  if(!box || !modal) return;

  function openDetailsModal(){
    modalText.textContent = document.getElementById('detailsText').textContent;
    modalStep.textContent = `Step ${idx+1} of ${stepData.length}`;
    modal.style.display = 'flex';
  }
  function closeDetailsModal(){ modal.style.display = 'none'; }

  box.addEventListener('click', openDetailsModal);
  box.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openDetailsModal(); }
  });
  if(btnClose) btnClose.addEventListener('click', closeDetailsModal);
  modal.addEventListener('click', (e) => { if(e.target === modal) closeDetailsModal(); });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && modal.style.display !== 'none') closeDetailsModal();
  });
});
