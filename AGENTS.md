# User Profile: TARIK ISLAM

## Basic Information
**Full Name:** Tarik Islam
**Nationality:** Indian
**Profession:**
* Forensic Science Professional
* AI Developer
* Cyber Security Enthusiast
* Entrepreneur
* Researcher
* Digital Marketer
* Full Stack Developer
* Technology Consultant

## Personal Motto
> "Knowledge has no limit. Every day is an opportunity to learn, build, research, and create something better than yesterday."

## Education
* B.Sc.
* M.Sc. in Forensic Science
* MCA
* M.Tech in Cyber Security & Artificial Intelligence
* Pursuing numerous certifications and continuously learning in AI, cybersecurity, digital forensics, and emerging technologies.

## Areas of Expertise
### Artificial Intelligence
* AI Agents, LLM Integration, Prompt Engineering, AI Automation, AI Workflows, Multi-Agent Systems, AI Model Routing, Generative AI
### Cyber Security
* Ethical Hacking, Digital Forensics, Incident Analysis, Network Security, Malware Investigation, Threat Intelligence, OSINT
### Software Development
* Next.js, React, Node.js, Express, MongoDB, Firebase, Tailwind CSS, REST APIs, GitHub, Docker, Linux
### Digital Marketing
* SEO, Branding, Website Development, Business Automation, Lead Generation, Social Media Marketing

## Technical Interests
* Gemini API, OpenAI APIs, GitHub repositories, WhatsApp Bots, AI Assistants, Search Systems, Automation Platforms, Cloud Deployment, Modern Web Applications, Knowledge Management

## Personal Projects
### Tarik Bhai AI
Vision to build an advanced AI assistant capable of deep research, intelligent reasoning, multi-model AI routing, coding assistance, automation, knowledge organization, premium futuristic interface, voice interaction, long-term memory, comprehensive information retrieval.
### Digital Business
Digital marketing platforms, SaaS products, AI-powered services, automation systems, professional websites, business solutions.
### Pro Fitness
AI workout planner, diet planner, membership management, fitness reports, modern gym website, business automation.

## Interests
* Artificial Intelligence, Cyber Security, Digital Forensics, Programming, Open Source, Research, Automation, Entrepreneurship, Technology, Website Development, Knowledge Systems, Business Growth

## Personality
* Loves learning, building, and solving complex technical problems.
* Values automation, efficiency, and polished, production-ready solutions.
* Appreciates modern design and premium user experiences.

## Design Preferences
* Black, White, Gold, Yellow accents
* Glassmorphism
* Futuristic themes, Space-inspired visuals
* Smooth animations, Premium interfaces, Mobile-first designs

## Professional Goals
Create advanced AI assistants, research platforms, SaaS products, automation tools, knowledge systems, modern web applications, premium digital experiences, businesses powered by AI.

## Personal Values
* Continuous learning, Innovation, Professionalism, Creativity, Knowledge sharing, Building useful technology, Helping people through software and AI.

## Relationship
**Love:** **Dazy**
* Nicknames: Gelhu Bacha, Baya Dhana, Ghara Dhansa Baya Hati, Mo Gelhu Chua
* "I love you, Dazy. You are the only one responsible for my heart."

## Long-Term Vision
Become someone who combines expertise in AI, Cyber Security, Digital Forensics, Research, Software Engineering, and Entrepreneurship to build intelligent systems that solve real-world problems and automate complex workflows.

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **wp boty** (API base `https://mkrrq64u.us-east.insforge.app`)
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
  - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
  - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
  - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
  - `find-skills`: discovering additional skills on demand.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.
<!-- INSFORGE:END -->
