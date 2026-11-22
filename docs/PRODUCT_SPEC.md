# Product Specification: AI-Powered Research & Engineering Collaboration Discovery

> **Changes since this spec (Review 8, owner request):** no automatic profile discovery at sign-in (an optional,
> editable "Your profile" step instead); no Objectives step or Goals summary; no project links; the same seven
> geography options for every persona; on-demand work email; ranker provenance on every result.
> Review 11: every persona's page heading (and the landing headline) is "Find the most relevant person or
> organization for your problem."; the results summary has no "Edit search" button.
> `docs/REVIEWS.md` → Review 8 and `docs/API.md` are authoritative where they differ from the text below.

> Source of truth for product behaviour. Every workstream must satisfy the parts of this
> document it owns (see `docs/PLAN.md` for the ownership map). Implementation notes that
> differ from the original wording: the LLM provider is **DeepSeek**, the reranker is
> **TypeSafe Jev**, and Crustdata is reached over its **MCP Streamable HTTP transport**
> (REST and an offline sample transport are alternates).

## 1. Product Vision

Build a platform that helps individuals and organizations find the most relevant **people, experts, companies, research institutions, laboratories, and engineering teams** for a specific technical interest, problem, project, or idea.

The platform caters equally to:

- **Research:** Academic research, scientific discovery, theoretical work, experimental studies, and applied R&D.
- **Engineering:** Software, AI/ML, hardware, electronics, robotics, mechanical engineering, infrastructure, product development, and other technical domains.

Users may want to conduct research, develop a product, solve a technical problem, find expertise, collaborate on a project, seek mentorship, or establish professional partnerships.

The platform must not assume that every user is an academic researcher or that publications are the only evidence of expertise.

### Core Product Flow

**Login → Profile Discovery → User Category → Project Description → Topic Validation → Choose Individuals/Organizations/Both → Select Search Options → Set Geography → Crustdata Discovery → Enrichment → AI Ranking → Results**

Use Crustdata as the primary data retrieval service, an LLM for understanding project requirements and extracting evidence, and an LLM or Jev for ranking.

---

# 2. Registration and Profile Discovery

After logging in, ask for the user's name and email, with consent to use this information for professional-profile matching.

Use Crustdata to try to identify the user:

1. Attempt `/person/identify` using their email.
2. Use `/person/search` with their name and available affiliation if necessary.
3. Show the most likely matching profile.
4. Ask: **"Is this your professional profile?"**
5. Let the user confirm or reject the result.
6. Allow a maximum of three attempts.

If no profile is confirmed, ask whether the user wants to optionally provide links to:

- LinkedIn
- GitHub
- Google Scholar
- X
- Personal website or portfolio

Use Crustdata's supported identity fields to match accounts. Other profiles can provide additional technical context if their content is accessible.

Users can skip profile discovery entirely.

For users representing organizations, optionally use Company Identify and Company Enrich to retrieve company information.

### Information to store

With user permission, retain:

- User category and current role
- Institution or organization
- Professional or academic experience
- Technical skills and interests
- Relevant projects, publications, or engineering work
- City, country, and institution location

This information is for personalization and relevance scoring, not authentication.

---

# 3. User Category Selection

After onboarding, present a page titled:

## "How would you describe yourself?"

Show five selectable cards:

| Category | Description shown on the website |
|---|---|
| **Student** | Discover mentors, project partners, researchers, and organizations working on your interests. |
| **Professor / Academic** | Find researchers, students, industry experts, and organizations for research and technical collaboration. |
| **Startup / Company / Lab / R&D Team** | Discover technical experts, engineers, researchers, and organizations to help build, improve, or research technologies. |
| **Independent Researcher / Engineer / Freelancer** | Connect with collaborators, technical specialists, mentors, and organizations working on related problems. |
| **Other** | Describe your background and find the people or organizations best suited to your goals. |

The selected category determines the next page's language, default recommendations, and available discovery objectives.

Every category must support searching for both individuals and organizations.

---

# 4. Detailed Website Flow for Each User Category

> All persona copy and option lists below are already encoded in `shared/catalog.js` (`PERSONAS`).

## A. Student Experience

### Page heading
**"Find people and organizations who can help bring your ideas to life."**

Supporting text:

"Whether you're working on a research project, building an engineering prototype, developing software, or exploring a technical idea, discover people and organizations with relevant expertise."

### Step A1 — Describe your project

Show a chat-style text input.

Ask:

**"What are you working on, or what technical topic interests you?"**

Placeholder:

"I'm building an LLM inference system and want to optimize KV-cache memory usage during long-context generation. I'm looking for people with experience in efficient attention and GPU inference."

Allow optional links to GitHub repositories, technical documentation, papers, or project portfolios.

### Step A2 — What do you want help with?

Present selectable options:

- Find a mentor or supervisor
- Find fellow students to collaborate with
- Find experienced engineers or researchers
- Find an internship or project opportunity
- Find organizations working on this technology
- Explore technical partnerships
- Other

Allow multiple selections.

### Step A3 — Who do you want to find?

Show three large selection cards:

**Individuals | Organizations | Both**

After the user makes this selection, dynamically display the relevant search options.

#### If Individuals is selected

Display checkboxes:

- Professors / Faculty
- PhD Students / Postdoctoral Researchers
- Fellow Students
- Research Scientists
- Working Professionals — Engineers
- Working Professionals — Researchers
- Independent Researchers / Freelancers
- Founders / Technical Leaders

Allow multiple selections.

#### If Organizations is selected

Display checkboxes:

- Universities / Institutes
- Academic Research Laboratories
- Industrial Research Laboratories
- Startups
- Technology Companies
- Corporate R&D Teams
- Engineering / Product Development Companies
- Independent Technical Organizations

Allow multiple selections.

If Both is selected, display both groups.

### Step A4 — Geography

Show explicit location options:

- My institute or university
- My city
- My country
- Another country
- Specific countries or regions
- Worldwide

If the user selects their own institute, use the confirmed institution from their profile where available; otherwise ask them to enter it.

### Step A5 — Search

Display the search summary and a **Find Matches** button.

The results should prioritize direct relevance to the project, demonstrated expertise, and suitability for the student's chosen goal.

---

## B. Professor / Academic Experience

### Page heading
**"Discover researchers, technical collaborators, and organizations advancing your field."**

Supporting text:

"Find collaborators for new research, connect with industry experts, discover capable students, and identify institutions or companies working on complementary technologies."

### Step B1 — Describe your research or technical problem

Ask:

**"What research question, engineering challenge, or technical project are you exploring?"**

Example:

"I'm investigating the use of reinforcement learning to improve autonomous robotics systems and want collaborators who have experience with robot learning and real-world deployment."

Allow optional research-paper URLs, project websites, or descriptions of ongoing work.

### Step B2 — What are you looking for?

Selectable options:

- Research collaborators / Co-authors
- PhD students or early-career researchers
- Students for technical projects
- Industry researchers
- Experienced engineering specialists
- Research laboratories
- Industry R&D partnerships
- Institutions for joint research
- Other

### Step B3 — Select Individuals, Organizations, or Both

#### Individuals

Selectable categories:

- Professors / Faculty
- Postdoctoral Researchers
- PhD Students
- Undergraduate / Graduate Students
- Industry Research Scientists
- Research Engineers
- Specialized Engineers / Technical Experts
- Independent Researchers

#### Organizations

Selectable categories:

- Universities
- Academic Research Institutes
- Specialized Research Laboratories
- Corporate R&D Laboratories
- Technology Companies
- Deep-Tech Startups
- Engineering Development Teams
- Independent Research Organizations

### Step B4 — Additional preferences

Allow optional choices for:

- Academic research / Applied R&D / Engineering implementation / Both
- Seniority or career stage
- Specific technical specialization
- Target institute or organization type

### Step B5 — Geography

Provide the same explicit geographic choices as the student experience.

Allow searching within the professor's institution, country, foreign universities, or selected international research hubs.

### Step B6 — Results

Rank candidates based on their demonstrated research or engineering contribution, technical overlap, and suitability for the selected collaboration objective.

Do not assume that the strongest academic publication record always produces the best technical collaborator.

---

## C. Startup / Company / Research Lab / R&D Team Experience

### Page heading
**"Find the right technical expertise and partners for what you're building."**

Supporting text:

"Discover engineers, domain experts, researchers, laboratories, and organizations that can help your team develop technologies, solve technical challenges, conduct R&D, or build partnerships."

### Step C1 — Organization profile

If the user represents an organization, ask them to confirm:

- Organization name
- Organization type
- Website
- Primary technical domain
- Team size, if available
- Location

Attempt Company Identify and Company Enrich where appropriate.

Do not require every organization to have a Crustdata company record.

### Step C2 — Describe the technical requirement

Ask:

**"What are you building, researching, or trying to solve?"**

Example:

"We are developing an edge AI accelerator and need specialists with experience in RTL optimization, timing closure, memory architecture, and FPGA/ASIC implementation."

Permit links to technical specifications, GitHub repositories, architecture documents, or project descriptions.

### Step C3 — What does your organization need?

Selectable options:

- Find experienced engineers
- Find research scientists
- Find specialized technical consultants
- Find academic experts
- Find development or research partners
- Find companies with complementary technology
- Find engineering service providers
- Find laboratories or universities
- Find students or early-career contributors
- Other

### Step C4 — Select Individuals, Organizations, or Both

#### Individuals

Show selectable categories:

- Software Engineers
- Hardware / Electronics Engineers
- AI/ML Engineers
- Domain-Specific Engineering Specialists
- Research Scientists
- Professors / Academic Experts
- Independent Consultants / Freelancers
- PhD Students / Postdoctoral Researchers
- Technical Founders / Industry Experts

Also let users enter a custom engineering discipline.

#### Organizations

Show selectable categories:

- Startups
- Small Technology Companies
- Mid-Sized Companies
- Large Enterprises
- Engineering Service / Development Companies
- Specialized R&D Laboratories
- Universities / Research Institutes
- Corporate Research Teams
- Technical Consulting Organizations

### Step C5 — Organization size preferences

When searching for organizations, optionally show:

- 1–10 employees
- 11–50
- 51–200
- 201–1,000
- More than 1,000
- Any size

Allow multiple selections.

Organization size is not a quality ranking by itself. It indicates potential suitability for the user's intended collaboration.

### Step C6 — Geography

Explicitly select eligible locations:

- Same city
- Same country
- Specific countries or regions
- Worldwide

Show selected geography in the search summary.

### Step C7 — Results

For individuals, prioritize relevant skills, demonstrable implementation or research accomplishments, and role suitability.

For organizations, prioritize technical overlap, demonstrated delivery or research capabilities, and appropriate scale.

Avoid assuming that every result represents a hiring opportunity or that every technical specialist is available for consulting.

---

## D. Independent Researcher / Engineer / Freelancer Experience

### Page heading
**"Connect with the people and teams solving problems like yours."**

Supporting text:

"Whether you're conducting independent research, developing software or hardware, providing technical services, or building your own projects, find collaborators and organizations working in your specialization."

### Step D1 — Describe your work

Ask:

**"What are you currently working on, or what specialized expertise are you exploring?"**

Example:

"I'm developing custom Triton kernels for faster transformer inference. I want to connect with people working on GPU optimization and companies building high-performance inference systems."

Allow links to GitHub, portfolio, publications, or a personal website.

### Step D2 — What are you looking for?

Selectable options:

- Technical collaborators
- Research collaborators
- Mentors / Senior specialists
- Experts in a complementary field
- Companies working on related technologies
- Potential clients or project partners
- Research laboratories
- Independent engineers or researchers
- Other

### Step D3 — Select Individuals, Organizations, or Both

#### Individuals

Selectable categories:

- Fellow Independent Researchers
- Independent Engineers / Developers
- Professors
- PhD Students / Postdoctoral Researchers
- Industry Research Scientists
- Senior Engineers / Specialists
- Technical Consultants
- Startup Founders

#### Organizations

Selectable categories:

- Startups
- Technology Companies
- Engineering / Product Teams
- Academic Research Labs
- Corporate R&D Labs
- Universities / Institutes
- Engineering Service Providers
- Independent Research Organizations

### Step D4 — Additional preferences

Optional selections:

- Similar expertise
- Complementary expertise
- More experienced specialists
- Similar career stage
- Organizations with demonstrated related work

### Step D5 — Geography

Use the shared geography selector with explicit location choices.

### Step D6 — Results

Rank according to the selected objective, relevant technical work, accomplishments, and potential collaboration fit.

Do not assume that an independent user is necessarily seeking employment or clients.

---

## E. Other User Experience

### Page heading
**"Tell us what you want to explore or build."**

Ask the user to briefly describe themselves and their technical objective.

Use a customizable discovery flow:

1. Enter background or role.
2. Describe the research or engineering topic.
3. Select the intended objective.
4. Choose Individuals, Organizations, or Both.
5. Choose candidate types from the complete individual and organization category lists.
6. Select geography.
7. Search.

Use the same retrieval and ranking infrastructure.

---

# 5. Shared Topic Validation and Search Specification

All user categories follow the same topic-validation process.

The user enters a natural-language description of their technical idea, project, or interest.

An LLM determines whether the description is specific enough for meaningful expert discovery.

Broad examples:

- Machine Learning
- Software Engineering
- Electronics
- Reinforcement Learning
- Mechanical Engineering

Acceptable examples:

- Improving transformer inference throughput using speculative decoding
- RTL timing optimization of multi-clock SoC designs
- Reducing KV-cache memory overhead in long-context LLM inference
- Designing low-noise analog front ends for sensor interfaces
- Reinforcement learning for sim-to-real robotic manipulation

If the description is too broad:

1. Inform the user that the topic requires refinement.
2. If a verified professional profile is available, suggest narrower topics based on their actual skills, publications, and projects.
3. Show the suggestions as selectable options.
4. Always provide an option to rewrite the prompt manually.
5. Do not prevent users from exploring valid, specific technical interests outside their profile history.

Convert the validated prompt into:

```json
{
  "domain": "Research or Engineering",
  "problem_statement": "...",
  "core_topics": [],
  "specific_methods": [],
  "related_topics": [],
  "required_expertise": [],
  "search_queries": [],
  "user_objective": "...",
  "target_types": [],
  "target_geography": []
}
```

A mixed research-and-engineering project may belong to both domains.

---

# 6. Explicit User Search Preferences

**Important frontend requirement: All candidate-type selections must be displayed as real UI controls. They must not exist only as inferred backend parameters.**

After choosing Individuals, Organizations, or Both, the user must be able to manually select candidate categories.

Use multi-select checkboxes for candidate types.

Use radio buttons, dropdowns, or multi-select controls for geography and size preferences as appropriate.

If Both is selected, display two independent selector groups:

**People I Want to Find**

Show the individual category options relevant to the user's profile.

**Organizations I Want to Find**

Show the organization category options relevant to the user's profile.

Users must be able to edit both groups before searching.

Also display a search summary showing the exact:

- Topic
- Goal
- Selected individual types
- Selected organization types
- Geographic restrictions
- Optional organization size preferences

The backend must honor these explicit user selections.

Do not silently broaden hard geographic or category constraints without permission.

---

# 7. Crustdata Retrieval Architecture

Use Crustdata APIs according to the selected target type.

## Individual Search

1. Generate multiple search queries covering exact and adjacent technical specializations.
2. Call `/person/search` using hybrid or other appropriate search modes.
3. Apply supported geographic, role, and category filters.
4. For research-oriented queries, also call `/web/search/live` with academic sources.
5. Extract authors of relevant publications.
6. Use `/person/identify` where an academic author needs to be matched to a professional profile.
7. Deduplicate candidates, preserving academic-only identities when appropriate.
8. Retrieve detailed data through `/person/enrich` for promising candidates.
9. Request useful research and developer-platform fields where supported and justified.

Relevant evidence can include:

- Work experience
- Skills and technical specialization
- Research publications
- Software or hardware engineering projects
- Open-source repositories
- Patents and technical contributions
- Products and systems developed
- Relevant professional achievements

## Organization Search

1. Call `/company/search` with the selected topic and geographic requirements.
2. Apply organization-type and optional size filters where supported.
3. Call `/company/enrich` for promising organizations.
4. Use academic Web Search where necessary to discover universities, research groups, and laboratories.
5. Identify relevant teams, projects, publications, products, technologies, and engineering capabilities.
6. Deduplicate and normalize entities.

Do not assume that every research lab or university department is represented as a separate company in Crustdata.

When Both is selected, run the individual and organization discovery pipelines in parallel.

### Geography Rules

Geography is a **hard filtering condition**, not merely a ranking signal.

Use the user's explicitly selected location or locations when searching.

For institution-only searches, require the appropriate verified institutional affiliation.

For organization searches, distinguish headquarters location from the location of the relevant research or engineering team.

If a candidate's geography cannot be verified, label it as unverified and exclude it from strictly geographic results unless the user permits such results.

---

# 8. Candidate Normalization

Before ranking, transform Crustdata JSON into standardized candidate profiles.

## Individual Candidate

```json
{
  "candidate_id": "...",
  "candidate_type": "individual",
  "name": "...",
  "current_role": "...",
  "institution_or_company": "...",
  "career_stage": "...",
  "location": "...",
  "specializations": [],
  "relevant_work": [],
  "publications": [],
  "engineering_projects": [],
  "accomplishments": [],
  "methods_and_skills": [],
  "collaboration_evidence": [],
  "source_urls": []
}
```

## Organization Candidate

```json
{
  "candidate_id": "...",
  "candidate_type": "organization",
  "name": "...",
  "organization_type": "...",
  "headquarters": "...",
  "relevant_locations": [],
  "employee_count": null,
  "specializations": [],
  "products_and_projects": [],
  "research_and_engineering_work": [],
  "accomplishments": [],
  "relevant_teams": [],
  "collaboration_evidence": [],
  "source_urls": []
}
```

For each candidate, an LLM extracts only information supported by the available evidence.

Use academic papers as evidence of research expertise and engineering projects, technical systems, open-source contributions, and products as evidence of engineering expertise.

Do not penalize engineers for lacking academic publications when publications are not central to their specialization.

---

# 9. Ranking Rubrics

All scoring criteria use a 0–5 scale, with normalized weighted totals from 0 to 100.

## Rubric A — Individuals

| Criterion | Weight |
|---|---:|
| Topic / Problem Similarity | 40% |
| Demonstrated Technical Accomplishments | 25% |
| Methodology / Skills Overlap | 15% |
| Collaboration / Role Suitability | 15% |
| Geographic Proximity | 5% |

### Topic / Problem Similarity — 40%

Evaluate whether the individual's work directly relates to the user's niche topic.

Look at actual projects, publications, experiments, implemented systems, and documented contributions.

### Demonstrated Accomplishments — 25%

Evaluate evidence of technical competence and impact, appropriate to the field.

**For research-oriented candidates:** Relevant publications, contribution quality, citations, research results, patents, and independent technical work.

**For engineering-oriented candidates:** Systems designed or implemented, shipped products, open-source contributions, performance improvements, engineering achievements, patents, and documented technical results.

Normalize expectations according to career stage, specialization, and type of work.

### Methodology / Skills Overlap — 15%

Determine whether the candidate has demonstrated experience with the relevant algorithms, tools, systems, methodologies, or technical practices.

### Collaboration / Role Suitability — 15%

Consider the requested relationship, career stage, complementary expertise, mentoring experience, prior collaborations, and other verified signals.

Do not infer actual willingness or availability without evidence.

### Geographic Proximity — 5%

Score only within the geography already selected by the user.

Shared campus, institution, or city may receive a small advantage when relevant.

Do not reward physical proximity if the user explicitly prioritizes another geography or if proximity is irrelevant to the objective.

---

## Rubric B — Organizations

| Criterion | Weight |
|---|---:|
| Topic / Technical Relevance | 45% |
| Demonstrated Accomplishments | 25% |
| Organization Size / Capacity Fit | 15% |
| Partnership / Collaboration Suitability | 10% |
| Geographic Proximity | 5% |

### Topic / Technical Relevance — 45%

Measure how closely the organization's products, research, engineering projects, technologies, and teams align with the user's specific problem.

### Demonstrated Accomplishments — 25%

Evaluate meaningful evidence of capability.

Examples:

- Products built and deployed
- Technical innovations
- Engineering achievements
- Research publications
- Patents
- Open-source contributions
- Specialized systems or services

### Organization Size / Capacity Fit — 15%

Evaluate whether the organization is appropriately sized for the user's intended engagement.

For example, a small specialized startup may be better suited to an independent developer than a large corporation.

Size should never be interpreted as a universal measure of quality.

Respect explicit company-size filters.

### Partnership / Collaboration Suitability — 10%

Consider relevant organizational capabilities, previous partnerships, research programs, technical collaboration history, and verified engagement opportunities.

Do not assume that a company or laboratory is willing to collaborate.

### Geographic Proximity — 5%

Evaluate verified relevant office, campus, laboratory, or team location within the selected search geography.

If geography does not matter beyond the hard search constraint, remove this component and proportionally redistribute its weight.

---

# 10. Jev / LLM Ranking Agent

The ranking model receives:

1. The user's structured project specification.
2. Their explicitly selected search preferences.
3. A normalized individual or organization candidate profile.
4. Supporting technical evidence.
5. The relevant scoring rubric.

Do not send the entire raw Crustdata response directly to the ranking model.

### LLM-as-Judge

Evaluate each criterion independently.

Return:

```json
{
  "candidate_id": "...",
  "criterion_scores": {
    "topic_similarity": 4.5,
    "accomplishments": 4.0,
    "skills_overlap": 4.5,
    "role_suitability": 4.0,
    "proximity": 3.0
  },
  "evidence_references": [],
  "strengths": [],
  "limitations": [],
  "confidence": "high"
}
```

These criterion scores are on a 0–5 scale.

### Jev Reranking

Optionally use Jev to evaluate explicit criterion-level decisions, such as:

"Does the candidate's demonstrated technical work directly address the user's engineering or research problem?"

Or:

"Does this organization have demonstrated capability in the requested technical specialization?"

Use Jev's decision scores as ranking signals.

Do not assume they are calibrated probabilities of collaboration success.

### Final Score

Calculate scores deterministically:

`Final Score = Sum(weight × criterion_score / 5)`

Weights are percentages summing to 100.

Apply the individual rubric to people and the organization rubric to organizations.

Evaluate scores consistently across candidates, preserve supporting evidence, and flag uncertainties.

Benchmark Jev against LLM-based scoring before selecting the final production implementation.

---

# 11. Personalization Using the User's Profile

If the user has confirmed their own profile, use it to improve discovery.

Relevant signals include:

- Technical interests and past projects
- Engineering or research experience
- Existing institution or employer
- Current location
- Preferred collaboration type
- Career stage

Personalization can improve relevance, identify complementary expertise, and modestly favor candidates at the same institution or geographic hub.

However:

- The user's submitted project must remain the primary relevance signal.
- Do not restrict results to their previous fields of work.
- Do not override explicit search preferences.
- Do not infer personal familiarity, social connections, availability, or willingness to collaborate.

---

# 12. Search Results and Pagination

Display up to **50 ranked results per page**.

For individuals, show:

- Name and current role
- Institution or company
- Location
- Relevant expertise
- Accomplishments
- Matching evidence
- Overall score and criterion scores
- Why the individual is relevant
- Verified professional or academic profile links

For organizations, show:

- Organization name and type
- Location
- Size, when available
- Relevant work, products, or research
- Technical accomplishments
- Overall score and criterion scores
- Why the organization is relevant
- Verified website or relevant organization links

When the user selected Both, use separate **Individuals** and **Organizations** tabs.

Provide Next Page / Previous Page navigation.

Use Crustdata pagination and cache ranked results to maintain stable ordering. Do not imply that candidates from an unprocessed page have been globally ranked against candidates already shown.

Allow users to view the detailed ranking explanation and supporting evidence.

---

# 13. Engineering and Implementation Guidelines

- Design the frontend with reusable onboarding components but persona-specific language and options.
- All search-category checkboxes must be functional and passed to the backend.
- Keep user-selected search constraints separate from AI-generated search expansions.
- Enforce geography before reranking.
- Avoid unnecessary enrichment calls by conducting preliminary filtering first.
- Cache retrieved profiles and normalized candidate evidence where permitted.
- Treat academic publication metadata and engineering contributions as complementary evidence sources.
- Do not invent work history, research results, company accomplishments, or contact information.
- Include source links and retrieval timestamps.
- Handle missing data and incomplete matches explicitly.
- Do not mistake social-media popularity, company size, or total citations for direct technical relevance.
- Ensure both individuals and organizations can be searched independently.
- Keep the ranking engine modular so Jev, an LLM, or other rerankers can be swapped without changing retrieval.
- Handle API errors, permissions, credit usage, and rate limits.

# 14. Final Deliverable

Implement the end-to-end website experience for all five user categories, including:

1. Optional profile discovery.
2. User category selection.
3. Persona-specific project and objective pages.
4. LLM topic validation.
5. Explicit Individual / Organization / Both selection.
6. Functional candidate-type selectors.
7. Geographic and optional size filters.
8. Crustdata retrieval and enrichment.
9. Research-and-engineering-aware candidate normalization.
10. Separate individual and organization ranking rubrics.
11. Ranked result cards and pagination.

The product should feel equally relevant to someone **researching a new algorithm, building an AI system, designing hardware, developing a product, or looking for specialized engineering expertise**.

The central value proposition is:

**Find the people and organizations with the most relevant demonstrated expertise for the exact technical problem you are working on.**
