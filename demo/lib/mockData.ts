import type { MockWorkspace, MockDocument, MockMessage } from "./types";

// ---- Documents ----

const medicalDocs: MockDocument[] = [
  {
    id: "doc-med-1",
    name: "cardiology_guide.pdf",
    pageCount: 48,
    size: "3.2 MB",
    status: "ready",
    readyPages: 14,
    uploadedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    type: "text",
    filePath: "/sample-pdfs/sample-a.pdf",
  },
  {
    id: "doc-med-2",
    name: "who_guidelines.pdf",
    pageCount: 32,
    size: "1.8 MB",
    status: "ready",
    readyPages: 3,
    uploadedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    type: "text",
    filePath: "/sample-pdfs/sample-b.pdf",
  },
  {
    id: "doc-med-3",
    name: "drug_trials_2024.pdf",
    pageCount: 24,
    size: "2.1 MB",
    status: "partial",
    readyPages: 1,
    uploadedAt: new Date(Date.now() - 3600000).toISOString(),
    type: "mixed",
    filePath: "/sample-pdfs/sample-c.pdf",
  },
  {
    id: "doc-med-4",
    name: "ecg_interpretation.pdf",
    pageCount: 18,
    size: "1.4 MB",
    status: "ready",
    readyPages: 14,
    uploadedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    type: "scanned",
    filePath: "/sample-pdfs/sample-a.pdf",
  },
];

const legalDocs: MockDocument[] = [
  {
    id: "doc-leg-1",
    name: "vendor_agreement.pdf",
    pageCount: 22,
    size: "0.9 MB",
    status: "ready",
    readyPages: 14,
    uploadedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    type: "text",
    filePath: "/sample-pdfs/sample-a.pdf",
  },
  {
    id: "doc-leg-2",
    name: "nda_framework.pdf",
    pageCount: 14,
    size: "0.6 MB",
    status: "ready",
    readyPages: 3,
    uploadedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    type: "text",
    filePath: "/sample-pdfs/sample-b.pdf",
  },
  {
    id: "doc-leg-3",
    name: "ip_policy_v3.pdf",
    pageCount: 30,
    size: "1.2 MB",
    status: "processing",
    readyPages: 0,
    uploadedAt: new Date(Date.now() - 600000).toISOString(),
    type: "text",
    filePath: "/sample-pdfs/sample-c.pdf",
  },
  {
    id: "doc-leg-4",
    name: "liability_waiver.pdf",
    pageCount: 8,
    size: "0.3 MB",
    status: "ready",
    readyPages: 8,
    uploadedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    type: "text",
    filePath: "/sample-pdfs/sample-a.pdf",
  },
  {
    id: "doc-leg-5",
    name: "employment_contract.pdf",
    pageCount: 16,
    size: "0.7 MB",
    status: "error",
    readyPages: 0,
    uploadedAt: new Date(Date.now() - 86400000).toISOString(),
    type: "scanned",
    filePath: "/sample-pdfs/sample-b.pdf",
  },
];

const thesisDocs: MockDocument[] = [
  {
    id: "doc-the-1",
    name: "literature_review.pdf",
    pageCount: 56,
    size: "4.1 MB",
    status: "ready",
    readyPages: 14,
    uploadedAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    type: "text",
    filePath: "/sample-pdfs/sample-a.pdf",
  },
  {
    id: "doc-the-2",
    name: "methodology.pdf",
    pageCount: 28,
    size: "2.3 MB",
    status: "ready",
    readyPages: 3,
    uploadedAt: new Date(Date.now() - 86400000 * 12).toISOString(),
    type: "text",
    filePath: "/sample-pdfs/sample-b.pdf",
  },
  {
    id: "doc-the-3",
    name: "results_chapter.pdf",
    pageCount: 34,
    size: "2.8 MB",
    status: "partial",
    readyPages: 1,
    uploadedAt: new Date(Date.now() - 7200000).toISOString(),
    type: "mixed",
    filePath: "/sample-pdfs/sample-c.pdf",
  },
  {
    id: "doc-the-4",
    name: "appendix_data.pdf",
    pageCount: 20,
    size: "5.6 MB",
    status: "ready",
    readyPages: 14,
    uploadedAt: new Date(Date.now() - 86400000 * 8).toISOString(),
    type: "mixed",
    filePath: "/sample-pdfs/sample-a.pdf",
  },
];

// ---- Messages ----

const medicalMessages: MockMessage[] = [
  {
    id: "msg-med-1",
    role: "user",
    content: "What is the clinical definition of hypertension according to these documents?",
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "msg-med-2",
    role: "assistant",
    content:
      "Based on the reviewed documents, hypertension is clinically defined as sustained blood pressure exceeding 130/80 mmHg. The WHO guidelines emphasize lifestyle modification as first-line treatment before pharmacological intervention, particularly for Stage 1 hypertension. The cardiology guide further distinguishes between primary (essential) hypertension, which accounts for approximately 95% of cases, and secondary hypertension caused by identifiable underlying conditions.",
    citations: [
      {
        documentId: "doc-med-2",
        filename: "who_guidelines.pdf",
        pageNumber: 2,
        excerpt:
          "Hypertension is defined as blood pressure ≥130/80 mmHg based on an average of two or more readings taken on two or more occasions.",
      },
      {
        documentId: "doc-med-1",
        filename: "cardiology_guide.pdf",
        pageNumber: 12,
        excerpt:
          "Primary hypertension accounts for 90–95% of all hypertension cases and develops gradually over many years without a single identifiable cause.",
      },
    ],
    timestamp: new Date(Date.now() - 86400000 * 2 + 60000).toISOString(),
  },
  {
    id: "msg-med-3",
    role: "user",
    content: "What drug classes are used as first-line antihypertensives?",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "msg-med-4",
    role: "assistant",
    content:
      "The documents identify five major drug classes as first-line antihypertensive therapy:\n\n1. **ACE inhibitors** (e.g., lisinopril, enalapril) — preferred in patients with diabetes or CKD\n2. **ARBs** (e.g., losartan, valsartan) — used when ACE inhibitors cause cough\n3. **Calcium channel blockers** (e.g., amlodipine) — effective across most patient populations\n4. **Thiazide diuretics** (e.g., hydrochlorothiazide) — particularly effective in African American patients\n5. **Beta-blockers** — typically reserved for patients with comorbid heart failure or arrhythmia\n\nCombination therapy is recommended when a single agent achieves less than 20/10 mmHg reduction.",
    citations: [
      {
        documentId: "doc-med-1",
        filename: "cardiology_guide.pdf",
        pageNumber: 9,
        excerpt:
          "First-line pharmacotherapy should be initiated with ACE inhibitors, ARBs, CCBs, or thiazide diuretics, selected based on patient comorbidities.",
      },
      {
        documentId: "doc-med-2",
        filename: "who_guidelines.pdf",
        pageNumber: 3,
        excerpt:
          "Combination therapy at low doses is preferred over monotherapy at high doses to reduce adverse effects while achieving target blood pressure.",
      },
    ],
    timestamp: new Date(Date.now() - 86400000 + 90000).toISOString(),
  },
  {
    id: "msg-med-5",
    role: "user",
    content: "Are there any contraindications mentioned for beta-blockers?",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "msg-med-6",
    role: "assistant",
    content:
      "Yes. The cardiology guide lists several important contraindications for beta-blockers in hypertension management: bronchospastic airway disease (asthma, COPD), symptomatic bradycardia, second or third-degree heart block without a pacemaker, and decompensated heart failure. Relative contraindications include Raynaud's phenomenon and metabolic syndrome due to potential masking of hypoglycemia symptoms in diabetic patients.",
    citations: [
      {
        documentId: "doc-med-1",
        filename: "cardiology_guide.pdf",
        pageNumber: 12,
        excerpt:
          "Beta-blockers are absolutely contraindicated in bronchospastic disease and high-degree AV block. Use with caution in patients with insulin-dependent diabetes.",
      },
    ],
    timestamp: new Date(Date.now() - 3600000 + 75000).toISOString(),
  },
];

const legalMessages: MockMessage[] = [
  {
    id: "msg-leg-1",
    role: "user",
    content: "What are the key intellectual property clauses in the vendor agreement?",
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "msg-leg-2",
    role: "assistant",
    content:
      "The vendor agreement contains three primary IP provisions. First, a **work-for-hire clause** (Section 8.2) stipulating that all deliverables created under the agreement become the exclusive property of the client. Second, a **pre-existing IP carve-out** that allows the vendor to retain ownership of tools and methodologies developed prior to the engagement. Third, a **license-back provision** granting the vendor a non-exclusive license to use client-owned deliverables for portfolio purposes, subject to confidentiality restrictions.",
    citations: [
      {
        documentId: "doc-leg-1",
        filename: "vendor_agreement.pdf",
        pageNumber: 11,
        excerpt:
          "Section 8.2: All work product, inventions, and deliverables created during the term of this Agreement shall be deemed works made for hire.",
      },
      {
        documentId: "doc-leg-2",
        filename: "nda_framework.pdf",
        pageNumber: 2,
        excerpt:
          "Pre-existing intellectual property retained by either party shall not be subject to assignment under this Agreement.",
      },
    ],
    timestamp: new Date(Date.now() - 86400000 * 3 + 80000).toISOString(),
  },
  {
    id: "msg-leg-3",
    role: "user",
    content: "What is the duration of the NDA?",
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "msg-leg-4",
    role: "assistant",
    content:
      "According to the NDA framework, the confidentiality obligations survive for **5 years** from the date of disclosure of each piece of confidential information, or until the information becomes publicly available through no fault of the receiving party — whichever occurs first. Trade secrets are subject to perpetual protection under applicable law regardless of the 5-year term.",
    citations: [
      {
        documentId: "doc-leg-2",
        filename: "nda_framework.pdf",
        pageNumber: 3,
        excerpt:
          "Confidentiality obligations shall remain in effect for a period of five (5) years from the date of each disclosure, notwithstanding termination of the Agreement.",
      },
    ],
    timestamp: new Date(Date.now() - 86400000 * 2 + 50000).toISOString(),
  },
  {
    id: "msg-leg-5",
    role: "user",
    content: "Does the vendor agreement include any limitation of liability caps?",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "msg-leg-6",
    role: "assistant",
    content:
      "Yes. Section 12 of the vendor agreement establishes a mutual limitation of liability capped at the total fees paid or payable in the 12 months preceding the claim. This cap explicitly excludes: (a) breaches of confidentiality obligations, (b) indemnification obligations for third-party IP infringement claims, and (c) gross negligence or willful misconduct. Neither party may be held liable for consequential, indirect, or punitive damages.",
    citations: [
      {
        documentId: "doc-leg-1",
        filename: "vendor_agreement.pdf",
        pageNumber: 10,
        excerpt:
          "Each party's total aggregate liability shall not exceed the total fees paid under this Agreement in the twelve (12) months immediately preceding the claim.",
      },
    ],
    timestamp: new Date(Date.now() - 86400000 + 65000).toISOString(),
  },
];

const thesisMessages: MockMessage[] = [
  {
    id: "msg-the-1",
    role: "user",
    content: "What is the main research gap identified in the literature review?",
    timestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: "msg-the-2",
    role: "assistant",
    content:
      "The literature review identifies a significant gap in longitudinal studies examining the relationship between sleep quality and cognitive performance in adults over 60. While cross-sectional studies are well-represented, fewer than 12% of reviewed papers include follow-up periods exceeding 18 months. The review specifically calls out the absence of studies controlling for polypharmacy — a critical confound in elderly populations.",
    citations: [
      {
        documentId: "doc-the-1",
        filename: "literature_review.pdf",
        pageNumber: 7,
        excerpt:
          "A notable gap exists in longitudinal studies with follow-up periods >18 months examining sleep-cognition associations in adults aged 60 and above.",
      },
      {
        documentId: "doc-the-1",
        filename: "literature_review.pdf",
        pageNumber: 11,
        excerpt:
          "Fewer than 12% of reviewed studies controlled for polypharmacy, despite its known effects on both sleep architecture and cognitive function in elderly cohorts.",
      },
    ],
    timestamp: new Date(Date.now() - 86400000 * 5 + 70000).toISOString(),
  },
  {
    id: "msg-the-3",
    role: "user",
    content: "What sample size was used in the methodology?",
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "msg-the-4",
    role: "assistant",
    content:
      "The methodology chapter describes a sample of **284 participants** recruited from three community health centers, with a final analyzed sample of **261** after exclusions for incomplete actigraphy data and withdrawal. The sample was stratified by age band (60–69, 70–79, 80+) and included 54% female participants. Power analysis indicated a minimum of 230 participants was needed to detect medium effect sizes (d=0.4) at 80% power.",
    citations: [
      {
        documentId: "doc-the-2",
        filename: "methodology.pdf",
        pageNumber: 2,
        excerpt:
          "A total of 284 participants were recruited; 261 were included in the final analysis following exclusion of 23 participants with incomplete actigraphy recordings.",
      },
      {
        documentId: "doc-the-2",
        filename: "methodology.pdf",
        pageNumber: 3,
        excerpt:
          "Power analysis using G*Power 3.1 determined a minimum sample of 230 participants to achieve 80% power at α=0.05 for medium effect sizes (Cohen's d=0.40).",
      },
    ],
    timestamp: new Date(Date.now() - 86400000 * 3 + 85000).toISOString(),
  },
  {
    id: "msg-the-5",
    role: "user",
    content: "Summarize the key findings from the results chapter.",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "msg-the-6",
    role: "assistant",
    content:
      "The results chapter (currently partially indexed) indicates three primary findings so far:\n\n1. **Sleep efficiency** was significantly associated with working memory scores (r=0.41, p<0.001) after controlling for age, sex, and medication use\n2. Participants in the **70–79 age band** showed the strongest correlation between fragmented sleep and executive function decline\n3. REM sleep proportion was not independently predictive of cognitive outcomes when sleep efficiency was included in the model\n\nNote: 22 of 34 pages are currently indexed — additional findings may be available once processing completes.",
    citations: [
      {
        documentId: "doc-the-3",
        filename: "results_chapter.pdf",
        pageNumber: 1,
        excerpt:
          "Sleep efficiency demonstrated a moderate positive correlation with working memory composite scores (r=0.41, 95% CI [0.31, 0.50], p<0.001).",
      },
    ],
    timestamp: new Date(Date.now() - 86400000 + 95000).toISOString(),
  },
];

// ---- Workspaces ----

export const mockWorkspaces: MockWorkspace[] = [
  {
    id: "ws-medical",
    name: "Medical Research",
    documents: medicalDocs,
    messages: medicalMessages,
    lastActive: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "ws-legal",
    name: "Legal Contracts",
    documents: legalDocs,
    messages: legalMessages,
    lastActive: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "ws-thesis",
    name: "Thesis Work",
    documents: thesisDocs,
    messages: thesisMessages,
    lastActive: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
];

// ---- Pool of mock responses for new user messages ----

export interface MockResponseTemplate {
  content: string;
  citations?: Array<{
    filename: string;
    pageNumber: number;
    excerpt: string;
  }>;
}

export const mockResponsePool: MockResponseTemplate[] = [
  {
    content:
      "Based on the documents in this workspace, I found several relevant sections addressing your question. The key insight is that the material covers this topic from multiple angles, with the primary source providing the most detailed treatment on page 14, where the core methodology is laid out systematically.",
    citations: [],
  },
  {
    content:
      "I've reviewed the relevant sections across your documents. The evidence consistently supports the conclusion you're asking about, though there are some nuances worth noting — particularly around the edge cases described in the appendices.",
    citations: [],
  },
  {
    content:
      "This is a well-covered topic in your document set. The documents provide complementary perspectives: the first takes a theoretical approach while the second focuses on practical application. Together they give a fairly complete picture.",
    citations: [],
  },
  {
    content:
      "I found direct references to this in two of your documents. There's some tension between the approaches described — one favors a more conservative interpretation while the other advocates for a broader reading. The context of your specific situation will determine which applies.",
    citations: [],
  },
  {
    content:
      "The documents don't explicitly address this exact question, but based on the related content I can offer an informed inference. The underlying principles described across pages 8–12 of the primary document would logically extend to this scenario.",
    citations: [],
  },
];

export function getWorkspaceById(id: string): MockWorkspace | undefined {
  return mockWorkspaces.find((ws) => ws.id === id);
}

export function getDocumentById(
  workspaceId: string,
  docId: string
): MockDocument | undefined {
  const ws = getWorkspaceById(workspaceId);
  return ws?.documents.find((d) => d.id === docId);
}
