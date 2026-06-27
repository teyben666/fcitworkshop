/**
 * English intel briefings — same ids and answer indices as intel-briefings-data.js.
 */
window.INTEL_BRIEFINGS_EN = [
    {
        id: "brief-01",
        title: "Hostile funds transfer notice",
        lines: [
            "[TOP SECRET · INTERNAL FORWARD]",
            "To all state vault duty officers: transfer standby cash RM 12,000 to account ending 8842 before 14:30.",
            "Verification passphrase is 「晨雾-7」; transfer memo: 「设备维护」.",
            "Late transfers trigger tier-2 audit. Do not reply to this email.",
            "— Task Force B · Kuala Lumpur"
        ],
        questions: [
            { prompt: "By what time must the transfer be completed?", choices: ["12:00", "14:30", "16:00"], answer: 1 },
            { prompt: "What should the transfer memo say?", choices: ["Emergency allocation", "Equipment maintenance", "Year-end settlement"], answer: 1 },
            { prompt: "What is the verification passphrase?", choices: ["晨雾-7", "夜航-3", "红树-9"], answer: 0 }
        ]
    },
    {
        id: "brief-02",
        title: "Sabah port intercepted telegram",
        lines: [
            "Intercept time: 09:17 · Source: KK port relay",
            "Target vessel 「海鹭号」 departs tonight at 22:00.",
            "Sealed crate SB-441 on board holds RM 8,500 cash.",
            "Handoff code 「椰风向西」; contact wears navy coveralls.",
            "Coastal watch: confirm crate number and report."
        ],
        questions: [
            { prompt: "When is 「海鹭号」 scheduled to depart?", choices: ["20:00", "22:00", "Midnight 0:00"], answer: 1 },
            { prompt: "What is the sealed crate number?", choices: ["SB-114", "SB-441", "SB-908"], answer: 1 },
            { prompt: "What is the handoff code?", choices: ["椰风向西", "东风过境", "蓝湾待命"], answer: 0 }
        ]
    },
    {
        id: "brief-03",
        title: "Penang ATM resupply order",
        lines: [
            "Penang North ATM cluster maintenance on Wednesday.",
            "Pre-load RM 25,000 in five runs of RM 5,000 each.",
            "First run departs 07:45; plate ends in 73.",
            "Escort ID: PG-NORTH-12.",
            "Incidents: duty chief extension 402."
        ],
        questions: [
            { prompt: "What is the total resupply amount?", choices: ["RM 15,000", "RM 25,000", "RM 35,000"], answer: 1 },
            { prompt: "What time does the first run depart?", choices: ["06:30", "07:45", "08:15"], answer: 1 },
            { prompt: "Escort identification code?", choices: ["PG-SOUTH-08", "PG-NORTH-12", "PG-CENTRAL-03"], answer: 1 }
        ]
    },
    {
        id: "brief-04",
        title: "Kuching night vault inspection",
        lines: [
            "Kuching West vault night inspection moved to 23:40 start.",
            "Inspector must verify safe shelves L3–L5 (18 slots total).",
            "Shortfall over RM 3,000: report codename 「琥珀」 immediately.",
            "Lock up within 15 minutes after inspection; upload fingerprint log.",
            "Covers all night shifts in the third week of June."
        ],
        questions: [
            { prompt: "What time does the inspection start?", choices: ["22:40", "23:40", "00:40"], answer: 1 },
            { prompt: "Which shelf levels must be checked?", choices: ["L1–L3", "L3–L5", "L5–L7"], answer: 1 },
            { prompt: "Report codename for shortfall over RM 3,000?", choices: ["琥珀", "石墨", "珊瑚"], answer: 0 }
        ]
    },
    {
        id: "brief-05",
        title: "Strait of Malacca patrol memo",
        lines: [
            "Patrol boat 「信天翁-2」 route updated.",
            "Temporary checkpoint near grid 109.2E / 4.8N.",
            "Check window: daily 11:00–11:20; intercept only boats without e-filing.",
            "Cash seizure cap RM 2,000 per incident.",
            "Patrol log due to command by 18:00."
        ],
        questions: [
            { prompt: "Where is the temporary checkpoint roughly?", choices: ["99.0E / 2.0N", "109.2E / 4.8N", "119.5E / 7.5N"], answer: 1 },
            { prompt: "What is the daily check window?", choices: ["09:00–09:20", "11:00–11:20", "15:00–15:20"], answer: 1 },
            { prompt: "Cash seizure registration cap per incident?", choices: ["RM 1,000", "RM 2,000", "RM 5,000"], answer: 1 }
        ]
    },
    {
        id: "brief-06",
        title: "Johor Bahru cross-border change packs",
        lines: [
            "JB checkpoint change-pack quota this week: RM 6,800.",
            "Denominations: RM 50 × 80 notes, RM 10 × 100 notes.",
            "Delivery: West checkpoint booth window 3 at 13:15.",
            "Recipient ID last four digits: 6621.",
            "Surplus change returned to central bank window by Friday 17:00."
        ],
        questions: [
            { prompt: "Total change-pack quota this week?", choices: ["RM 4,800", "RM 6,800", "RM 8,800"], answer: 1 },
            { prompt: "Delivery location?", choices: ["East window 1", "West window 3", "North window 5"], answer: 1 },
            { prompt: "Recipient ID last four digits?", choices: ["4412", "6621", "9033"], answer: 1 }
        ]
    },
    {
        id: "brief-07",
        title: "Ipoh mine payroll bags",
        lines: [
            "Ipoh South mine payroll bags release Thursday.",
            "42 bags, RM 950 each; seal strip color orange.",
            "Route: mine → Camp C → state vault; ETA state vault 10:30.",
            "Escort plate: PER 8824 K.",
            "Delay over 20 minutes: activate Route B."
        ],
        questions: [
            { prompt: "How many payroll bags?", choices: ["32 bags", "42 bags", "52 bags"], answer: 1 },
            { prompt: "Seal strip color?", choices: ["Green", "Orange", "Purple"], answer: 1 },
            { prompt: "Estimated arrival at state vault?", choices: ["09:30", "10:30", "11:30"], answer: 1 }
        ]
    },
    {
        id: "brief-08",
        title: "Kuantan refinery standby fund",
        lines: [
            "Kuantan refinery standby pool topped up RM 18,000 this week.",
            "Two batches: RM 10,000 (Monday), RM 8,000 (Thursday).",
            "Vault passphrase: 「潮汐-4」; location KD-VAULT-2.",
            "Dual sign-off: authorized engineers Lee and Wong only.",
            "Scan records to audit-kd@internal."
        ],
        questions: [
            { prompt: "Total top-up this week?", choices: ["RM 12,000", "RM 18,000", "RM 24,000"], answer: 1 },
            { prompt: "Vault passphrase?", choices: ["潮汐-4", "赤潮-1", "海风-9"], answer: 0 },
            { prompt: "Vault location code?", choices: ["KD-VAULT-1", "KD-VAULT-2", "KD-VAULT-3"], answer: 1 }
        ]
    },
    {
        id: "brief-09",
        title: "Langkawi peak-season reserve",
        lines: [
            "Langkawi peak season: pier exchange booth reserve raised to RM 9,200.",
            "Peak days Sat/Sun; +2 tellers.",
            "First ferry 08:10 — counter must be opened before then.",
            "Spare key in pier security locker B, code LG-07.",
            "End-of-day variance over RM 200: file Form 16-B."
        ],
        questions: [
            { prompt: "Reserve raised to how much?", choices: ["RM 7,200", "RM 9,200", "RM 11,200"], answer: 1 },
            { prompt: "Counter must open before first ferry at?", choices: ["07:10", "08:10", "09:10"], answer: 1 },
            { prompt: "Spare key locker code?", choices: ["LG-03", "LG-07", "LG-11"], answer: 1 }
        ]
    },
    {
        id: "brief-10",
        title: "Taiping hospital ER cash box",
        lines: [
            "Taiping Hospital ER cash box weekly count; baseline RM 4,500.",
            "Count: Tuesday 16:00, 2nd-floor finance office.",
            "Shortfall over RM 150: yellow alert; over RM 400: red alert.",
            "Counters: Dr. Chen + accountant Lin; dual fingerprint required.",
            "Report uploaded to hospital system within 24 hours."
        ],
        questions: [
            { prompt: "Baseline amount this week?", choices: ["RM 3,500", "RM 4,500", "RM 5,500"], answer: 1 },
            { prompt: "Count time?", choices: ["Tuesday 14:00", "Tuesday 16:00", "Wednesday 16:00"], answer: 1 },
            { prompt: "Red alert threshold?", choices: ["Over RM 200", "Over RM 400", "Over RM 600"], answer: 1 }
        ]
    },
    {
        id: "brief-11",
        title: "Miri rainforest camp resupply",
        lines: [
            "Miri rainforest camp resupply RM 7,300 via helicopter route.",
            "Landing pad codename 「绿鹦鹉」; grid block MR-12.",
            "Sign within 8 minutes of landing or shipment forfeited.",
            "Payload: RM 7,300 cash plus one sealed document pouch.",
            "Camp radio 446.025 MHz; call sign RainCamp-3."
        ],
        questions: [
            { prompt: "Resupply amount?", choices: ["RM 5,300", "RM 7,300", "RM 9,300"], answer: 1 },
            { prompt: "Landing pad codename?", choices: ["绿鹦鹉", "蓝鹭", "红隼"], answer: 0 },
            { prompt: "Camp call sign?", choices: ["RainCamp-1", "RainCamp-3", "RainCamp-5"], answer: 1 }
        ]
    },
    {
        id: "brief-12",
        title: "Putrajaya central bank internal transfer memo",
        lines: [
            "Putrajaya internal transfer: RM 31,000 from liquidity pool to emergency pool.",
            "Transfer order BN-2026-0618; authorizer grade L4 or above.",
            "Execution window today 15:00–15:10; late orders void automatically.",
            "On completion, system sends read-only sync summary to state vaults.",
            "Manual edits must be logged and copied to audit."
        ],
        questions: [
            { prompt: "Transfer amount?", choices: ["RM 21,000", "RM 31,000", "RM 41,000"], answer: 1 },
            { prompt: "Transfer order number?", choices: ["BN-2026-0518", "BN-2026-0618", "BN-2026-0718"], answer: 1 },
            { prompt: "Execution window end time?", choices: ["15:05", "15:10", "15:20"], answer: 1 }
        ]
    },
    {
        id: "brief-trap-ord",
        title: "Kuala Lumpur fast-food resupply route",
        lines: [
            "[Escort memo · East line]",
            "Stop 1: McDonald's Cheras (07:20 pickup).",
            "Stop 2: KFC Setapak (07:55 change-bag handoff).",
            "Stop 3: McDonald's Puchong (08:40 return leg).",
            "Driver ID KL-EAST-09; crate RM-BOX-118."
        ],
        questions: [
            { prompt: "Which store is the second stop on the route?", choices: ["McDonald's Cheras", "KFC Setapak", "McDonald's Puchong"], answer: 1, trap: "ordinal", trapHint: "The question asks for the second stop — not the first!" },
            { prompt: "Crate number?", choices: ["RM-BOX-108", "RM-BOX-118", "RM-BOX-128"], answer: 1 },
            { prompt: "Driver ID?", choices: ["KL-WEST-09", "KL-EAST-09", "KL-NORTH-09"], answer: 1 }
        ]
    },
    {
        id: "brief-trap-route",
        title: "Penang LRT change circuit",
        lines: [
            "Penang LRT change circuit resumes this week.",
            "Stop 1: Butterworth Station (06:50 open crate).",
            "Stop 2: George Town Station (07:35 replenish RM 3,200).",
            "Stop 3: Batu Maung Station (08:20 collect empty crate).",
            "Circuit plate PG-LRT-44; duty call sign FerryLoop-2."
        ],
        questions: [
            { prompt: "Which stop number is George Town Station on the circuit?", choices: ["First stop", "Second stop", "Third stop"], answer: 1 },
            { prompt: "How much to replenish at George Town Station?", choices: ["RM 2,200", "RM 3,200", "RM 4,200"], answer: 1 },
            { prompt: "Which stop collects the empty crate?", choices: ["Butterworth Station", "George Town Station", "Batu Maung Station"], answer: 2, trap: "route", trapHint: "Empty crate pickup is at Batu Maung (third stop) — not the second!" }
        ]
    },
    {
        id: "brief-trap-time",
        title: "Johor Bahru gate inspection reschedule",
        lines: [
            "JB checkpoint west booth inspection schedule updated.",
            "Original 13:00 inspection moved to 14:30 start.",
            "Inspector ID JH-GATE-W3; verify seal color orange.",
            "After reschedule, fingerprint log due before 15:00.",
            "Verbal reports do not replace formal inspection records."
        ],
        questions: [
            { prompt: "Actual inspection start time?", choices: ["13:00", "14:30", "15:00"], answer: 1, trap: "time", trapHint: "Watch for 「改至」(rescheduled to) — don't use the old 13:00 time!" },
            { prompt: "Seal color?", choices: ["Green", "Orange", "Blue"], answer: 1 },
            { prompt: "Fingerprint log upload deadline?", choices: ["Before 14:00", "Before 15:00", "Before 16:00"], answer: 1 }
        ]
    },
    {
        id: "brief-trap-neg",
        title: "Kuching vault verification rules excerpt",
        lines: [
            "Kuching West vault night release rules (excerpt).",
            "Allowed verification: dual fingerprint, dynamic passphrase, duty chief video confirm.",
            "Verbal report alone is prohibited for release.",
            "Anomaly codename 「琥珀」 only for shortfall over RM 3,000.",
            "Rule ID KCH-VAULT-2026-B."
        ],
        questions: [
            { prompt: "Which is NOT an allowed verification method?", choices: ["Dual fingerprint", "Verbal report", "Dynamic passphrase"], answer: 1, trap: "negation", trapHint: "Question asks what is NOT allowed — verbal report is prohibited!" },
            { prompt: "Anomaly codename 「琥珀」 is used when?", choices: ["Shortfall over RM 1,000", "Shortfall over RM 3,000", "Any delay"], answer: 1 },
            { prompt: "Rule ID?", choices: ["KCH-VAULT-2026-A", "KCH-VAULT-2026-B", "KCH-VAULT-2026-C"], answer: 1 }
        ]
    }
];
