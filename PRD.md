---
title: "Product Lifecycle World"
subtitle: "Product Requirements Document (PRD)"
author: "Designathon working document"
date: "17 October 2026"
---


**Document type:** Concept PRD for independent designathon evaluation  
**Version:** 1.0  
**Prepared:** 17 October 2026  
**Project name:** Not final; “Product Lifecycle World” is a descriptive working title.  
**Status:** Proposed concept; key assumptions require validation.  
**Purpose:** Define the concept, experience, requirements, boundaries, and evaluation questions without treating untested assumptions as facts.

> **Important framing:** This is for a designathon, not a conventional hackathon. The concept should be judged on originality, interaction design, clarity of the experience, behavioural logic, visual storytelling, and how well the prototype communicates the solution. Feasibility and implementation honesty still matter, but the PRD does not assume that every future feature must be fully engineered for the first presentation.

---

## 1. Executive Summary

Product Lifecycle World is a proposed two-sided product experience that connects product and packaging information supplied by producers to an engaging, Minecraft-inspired world used by consumers. Producers create a product record, define relevant product and packaging metadata, preview a packaging design, and issue a QR code that resolves to the record. Consumers scan the QR code or add a product through a fallback flow. The product becomes an interactive object in the consumer’s personal world, where themed areas represent storage environments and lifecycle destinations. Product-specific guidance, reminders, and visible world changes aim to turn responsible consumption into practical actions rather than generic sustainability awareness.

The proposed ecosystem has two distinct interfaces:

1. **Producer Studio:** a structured product and packaging workflow, potentially including parametric 3D packaging, selected design tests, iterative adjustments, and QR generation.
2. **Consumer World:** a personal voxel-inspired world for adding and managing products, seeing actual versus recommended storage, receiving context-sensitive guidance, and completing reuse, recycling, or disposal actions.

The central hypothesis is that trusted, product-specific information can become more actionable and memorable when presented through an interactive world that reflects real product events. The concept should not assume that the world itself changes behaviour; this must be tested.

A key technical boundary: **a QR code does not measure a product’s current physical condition.** It can connect users to dates, storage instructions, packaging details, and other recorded data. Current location, opening, usage, temperature exposure, and disposal must come from user-reported events, connected sensors, or other verified inputs. The initial concept primarily relies on user interaction and clearly labelled rules-based guidance.

The initial prototype should communicate one coherent end-to-end journey rather than imply that the entire long-term ecosystem is already implemented.

## 2. Source Problem Statement and Designathon Context

The problem statement shown in the provided poster is titled **“Rethinking Consumption: Designing for Responsible Choices.”** Its key framing is reproduced here in structured form:

- **Context:** From impulse purchases and fast-changing trends to products discarded before the end of their useful life, consumption habits contribute to unnecessary spending, excessive waste, and environmental damage. Responsible consumption is not simply about buying less; it is about rethinking how we purchase, use, reuse, and discard products.
- **Challenge:** How might design encourage people to make more responsible consumption choices? The solution should help consumers rethink consumption habits and encourage meaningful behavioural change.
- **Possible forms:** The solution may be an app, website, game, physical product, packaging concept, service, or an entirely new idea.
- **Behavioural change:** Encourage more conscious purchasing, reduced consumption, or greater reuse.
- **Consumer experience:** Make responsible choices intuitive, engaging, and practical.
- **Impact:** Demonstrate how the solution could reduce overconsumption or waste.
- **Innovation:** Go beyond awareness and generic sustainability messaging.
- **Scalability:** Consider how the solution could work beyond initial target users.
- **Goal:** “Design for better choices, not just better awareness.”
- **Submission expectations visible in the poster:** a final prototype, an explanation of how it solves the problem statement, and user research with empathy mapping/analysis, followed by a final jury submission.

This PRD treats those points as the primary evaluation context. It does not treat the earlier SIH packaging-focused framing as the current brief. Packaging design is part of the proposed concept, but it must serve the designathon’s wider consumption-behaviour goal rather than displace it.

## 3. Problem Framing

### 3.1 Problem to investigate

People may make less responsible consumption decisions when useful product information is unavailable, difficult to interpret, forgotten, or disconnected from the moment a decision needs to be made. Potential examples include buying duplicates, storing products in unsuitable conditions, forgetting items until they are no longer useful, discarding packaging that could have been reused, or not knowing how to dispose of materials appropriately.

These are **problem hypotheses, not verified findings about all consumers**. User research must identify which behaviours, barriers, and contexts are most relevant to the chosen audience.

### 3.2 Proposed design response

Connect product-specific information to a playful, persistent visual environment. A scan or product-add action introduces a product into the consumer’s world. The world then presents a small set of relevant, actionable choices based on available metadata and the user’s reported actions. Completing an action can change the product’s status and the world itself.

### 3.3 Intended behavioural outcome

The intended outcome is not simply higher app engagement. It is an increased likelihood that users will make one or more responsible choices, such as:

- reconsidering a purchase when they already have an equivalent product;
- storing a product according to its stated requirements;
- noticing and using an item before it is forgotten;
- reusing suitable packaging;
- following applicable recycling or disposal instructions;
- making more deliberate choices about buying, using, and discarding products.

The project should select and validate a small number of target behaviours for the prototype rather than claim to improve all of them equally.

## 4. Product Vision, Value Proposition, and Principles

### 4.1 Vision

Make responsible product decisions tangible through a personal interactive world that connects what a product is, how it is packaged, how it is used or stored, and what happens at the end of its useful life.

### 4.2 Proposed value proposition

**For consumers:** relevant product information is translated into visible, contextual next steps rather than left on packaging or buried in a reminder list.  
**For producers:** structured product and packaging information can be attached to a QR-linked record that consumers can access without manually re-entering every detail.  
**For the designathon jury:** the concept joins a distinctive game-like interaction with a real-world behaviour-change goal and a producer-to-consumer information bridge.

These are proposed values, not evidence of market demand or proven impact.

### 4.3 Design principles

1. **Action over awareness:** every advice interaction should help the user decide or do something concrete.
2. **World as interface, not decoration:** terrain, objects, and visual changes should communicate state or action.
3. **Truthful product state:** distinguish known facts, user-reported events, recommendations, and estimates.
4. **Support without guilt:** motivate through clarity, agency, progress, and useful feedback rather than shame or fear.
5. **A coherent lifecycle:** purchase consideration, storage/use, reuse, and end-of-life should connect where relevant.
6. **Progressive detail:** simple consumer guidance first; technical packaging detail belongs primarily in Producer Studio.
7. **Inclusive usability:** visual metaphors must be paired with clear labels and non-3D alternatives for essential tasks.
8. **Honest prototyping:** clearly separate working interactions, deterministic calculations, illustrative simulations, and future capabilities.

## 5. Users and Stakeholders

### 5.1 Primary user hypothesis: consumer

The intended consumer manages products in a home or shared living environment and may benefit from clearer visibility into what they own, how items should be stored or used, and what to do with packaging afterward. The initial audience is not yet validated. A practical research starting point could be students, young adults, or people living in shared households, but this must not be presented as a confirmed target market until interviews support it.

Possible needs:

- know what an item requires without searching through packaging or a website;
- remember relevant dates and actions;
- distinguish recommended storage from where an item is currently stored;
- avoid needless duplicates and product neglect;
- understand packaging materials and realistic end-of-life options;
- receive guidance at the right time without being overwhelmed by notifications.

### 5.2 Secondary user hypothesis: producer

A small producer, brand, product manager, or packaging professional who needs to register product attributes, packaging information, and consumer instructions. Their incentives may include clearer consumer communication, packaging development, or more consistent product information. The exact producer segment is unresolved.

Possible needs:

- create or update a product record;
- enter relevant metadata and storage instructions;
- describe packaging requirements;
- preview the package in 3D where supported;
- review selected test outputs and compare revisions;
- generate a QR code that resolves to the right product or batch record;
- see what information consumers will receive.

### 5.3 Other stakeholders

- Packaging manufacturers or designers.
- Retailers or distribution partners.
- Recycling and waste-management services.
- Household members who share storage spaces.
- Designathon reviewers evaluating user research, creativity, impact, and prototype coherence.

### 5.4 Research rule

Do not invent quotes, statistics, personas, empathy-map statements, or user findings. Any personas or journeys prepared before research must be labelled **provisional hypotheses**. Replace them with evidence from actual research, including contradictory findings.

## 6. Roles and End-to-End Concept

The experience begins with a role choice: **Consumer** or **Producer**. These roles use separate interfaces but share a product information layer.

### 6.1 Shared lifecycle model

1. A producer creates a product record and adds available attributes.
2. The producer links the record to a QR code for a product type or batch.
3. A consumer scans the code or uses a fallback product-add flow.
4. The consumer creates an individual inventory entry for the item in their own world.
5. The consumer confirms relevant details the system cannot know automatically, such as actual storage location or opening event.
6. The world surfaces relevant recommendations based on product data and recorded events.
7. When a product is consumed or no longer needed, the consumer records the outcome and may follow packaging reuse, recycling, or disposal guidance.
8. The world reflects the recorded outcome through object state, feedback, or environmental change.

The shared QR may identify a product type or batch; it should not be assumed to uniquely identify one physical item in a household. The consumer system must create a separate per-item record when tracking individual actions matters.

## 7. Producer Studio Requirements

### 7.1 Product creation flow

The producer can create a product using an image, selected product category, physical characteristics, or a combination. The first prototype should not rely on computer vision to infer every field correctly; provide editable fields and allow manual correction.

Potential record fields, shown only where applicable:

- product name and category;
- image and short description;
- approximate dimensions, weight, quantity, or unit size;
- batch identifier or product identifier;
- manufacturing or production date, where relevant;
- expiry date, best-before date, or other applicable date fields, with their meaning preserved;
- recommended storage conditions and applicable temperature range;
- relevant handling instructions and, if provided, post-opening guidance;
- package material(s), components, and separation instructions;
- reuse, recycling, and disposal guidance, including relevant caveats;
- producer or brand metadata and a support/contact link if appropriate.

Fields must not be mandatory if they are not applicable to the product. Avoid implying that a missing field means a condition is safe or irrelevant.

### 7.2 Packaging brief

The producer may describe the packaging they need, including:

- packaging format/template;
- target dimensions and shape;
- material preferences or constraints;
- wall thickness or other supported structural parameters;
- dividers, cushioning, compartments, closures, and ventilation where relevant;
- stackability and transport context;
- unit quantity or batch size;
- cost or material constraints;
- product protection and storage requirements.

For a designathon prototype, constrain the editable geometry to a small set of parametric templates rather than promising arbitrary, dependable AI-generated CAD geometry.

### 7.3 3D package generation and editing

The producer should be able to preview a package in 3D, rotate and zoom it, inspect the product inside where supported, and change selected parameters. The first prototype may use predefined package templates and a controlled parameter set. Changes must visibly update the model.

Potential templates include a simple carton, tray, or clamshell, but the final supported set should be selected based on the target product category and execution quality.

### 7.4 Tests and deterministic analysis

The broader concept includes packaging tests such as:

- drop or impact scenario;
- stack-pressure or stacking-stability estimate;
- transport-vibration scenario;
- packaging material and estimated cost comparison;
- estimated material use or waste.

For the first prototype, select only tests that can be demonstrated honestly. A simplified animation or rule-based score is not equivalent to a validated engineering simulation. Each result must identify assumptions and be labelled as one of: measured, calculated, simplified estimate, illustrative simulation, or validated test. Do not claim real material failure prediction, certified protection, or engineering-grade analysis without a suitable solver and validation data.

### 7.5 Iterate and publish

The producer may revise package parameters, compare a previous and current design, and mark a design as final. The final product record connects product metadata with the selected packaging design and its consumer-facing instructions.

The QR should resolve to a record, not encode all mutable data directly into the printed symbol. This allows information to be updated while the QR identifier remains stable, subject to the system’s identity and versioning design.

### 7.6 Producer acceptance criteria

- A producer can save a product record with relevant required fields and see validation for missing or inconsistent fields.
- At least one product record resolves through a generated QR code or demonstrable scan flow.
- A supported 3D package responds to its parameter controls if the 3D studio is included in the implemented prototype.
- Any tests or scores show their assumptions and limits.
- The consumer preview reflects the same information that the QR-linked record exposes.

## 8. Consumer World Requirements

### 8.1 Personal world

Each consumer has a separate world or a clearly separated personal inventory space. The world uses an original voxel-inspired aesthetic. Terrain communicates concepts, but should never be the only way to understand an instruction.

Illustrative mappings under consideration:

- icy region or freezer room: freezer storage;
- cool cave or refrigerated area: refrigerator storage;
- plains or a labelled indoor zone: room-temperature storage;
- covered forest or sheltered area: products requiring a dry, covered, or protected location, only where that mapping is appropriate;
- crafting, reuse, or sorting area: possible next steps for reusable packaging or end-of-life actions.

“Iceland equals freezer” and “forest equals shelter” are visual hypotheses. Test comprehension with users. Use explicit labels such as **Freezer**, **Refrigerator**, **Room Temperature**, **Dry/Covered Storage**, and **Reuse/Sort** so that playful metaphors remain legible. Do not use a zone if it would misrepresent the item’s stated instructions.

### 8.2 Add product via QR

On scan, the application retrieves the linked product record and creates an individual item entry for the consumer. A clear fallback flow supports a manual product add or an unrecognized code; the experience must not stop when a product is not in the sample catalogue.

The product object appears in the user’s world with relevant metadata and a default recommended storage zone when the record provides sufficient information. The consumer confirms the **actual location**. The user may move the object to match real storage.

The interface must distinguish:

- **Actual state/location:** user-reported or sensor-observed state;
- **Recommended state/location:** based on product information or documented guidance;
- **Unknown state:** information not available or not confirmed.

It must not silently place the object in the recommended zone and then imply that this is where it exists in the real world.

### 8.3 Product interaction

Selecting a product opens a detail panel or popup with:

- product name and image or 3D representation;
- relevant dates and their source;
- producer-provided storage instructions;
- current reported location and recommended storage;
- available material and packaging information;
- lifecycle actions such as mark opened, used, consumed, moved, reused, or disposed, where applicable;
- a clear next best action when appropriate.

The larger vision includes opening the product’s 3D packaging model in the consumer experience. The consumer-facing model should primarily explain packaging material, components, opening, separation, and end-of-life. Giving consumers the same engineering tests as producers is a speculative idea, not a core requirement; evaluate whether it produces a meaningful consumer decision before prioritising it.

### 8.4 Storage coach

A contextual storage coach uses available product instructions and user-reported events to suggest a next step, such as moving an item to the recommended zone. It should explain why it is making the recommendation and identify the source of the information when possible.

The coach must not infer exact current product temperature, spoilage, or safe-to-eat status from a QR code or passage of time alone. If actual condition is unknown, say so. Product dates and safety instructions must not be overridden by a gamified score.

### 8.5 Reuse, recycling, and sustainability coach

A contextual sustainability coach helps the user consider what to do with the product or packaging after use. Advice should be tied to the product record and should distinguish, where possible:

- whether the packaging is reusable and how it can be reused safely;
- whether components need to be separated;
- the producer’s stated material information;
- recycling or disposal recommendations and their limitations;
- unknown or locally dependent disposal information.

Do not label a material “sustainable” solely based on a simplistic score. Recyclability varies with local collection systems, material combinations, contamination, and facilities. Localised disposal guidance is a future enhancement unless reliable location-specific data is available.

### 8.6 Reminders and lifecycle events

The application can remind users about relevant dates or actions. Reminders must be configurable, explain what triggered them, and avoid sending repeated low-value notifications. Users should be able to snooze, dismiss, or mark an action complete.

Possible lifecycle events include:

- item added;
- actual storage location confirmed or changed;
- item opened, if relevant;
- item used or partially used, when meaningful;
- item consumed, finished, or discarded;
- packaging retained for reuse;
- packaging sorted for recycling or disposed of.

A reminder based on a printed date is a prompt to check the product, not a claim that the product’s physical condition is known. Distinguish use-by, expiry, best-before, and other date types where applicable; do not collapse them into a generic “freshness” certainty.

### 8.7 Candidate conscious-purchasing interaction

The concept may include a pre-purchase check that compares a planned purchase with items already recorded in the user’s inventory. For example: “You already have two of these. Do you need another today?” This directly connects to impulse purchasing and overconsumption.

This feature was identified as a potential improvement, but has not been validated. It should be treated as a **candidate design hypothesis** and tested for usefulness, tone, false matches, and risk of paternalism. Do not make it a mandatory MVP feature unless user research suggests it materially strengthens the concept.

### 8.8 World progression and rewards

Responsible actions may visibly improve or change the user’s world, for example through world growth, new details, repairs, or progression. Rewards should be attached to completed meaningful actions, not merely scans, purchases, or app opens.

Guardrails:

- do not reward the user for buying more products;
- avoid shame, streak anxiety, or punishment for missing reminders;
- avoid implying that a digital action itself produced a measured environmental benefit;
- distinguish an action logged by the user from one verified by an external source;
- allow users to manage notifications and progression cues.

### 8.9 Consumer acceptance criteria

- The consumer can add a known QR-linked product and understand what information came from the producer.
- An unknown product can be added through a fallback flow or receives a useful explanation and next step.
- A product can be placed in the actual reported zone, while the recommended zone remains visible when it differs.
- Selecting a product shows useful instructions and one clear next action.
- Completing an action updates the item record and produces meaningful world feedback.
- End-of-life guidance identifies unknown or locally dependent information rather than fabricating certainty.
- Essential functions remain understandable without relying on terrain colour or spatial memory alone.

\newpage

## 9. Core Functional Requirements and Priorities

Priority terms are for the **prototype plan**, not a statement that lower-priority ideas are unimportant to the long-term vision.

| ID | Requirement | Priority | Acceptance evidence |
|---|---|---|---|
| FR-01 | Role selection between Consumer and Producer | P0 | Both entry points reach a distinct usable flow. |
| FR-02 | Producer can create and save a product record | P0 | A sample record is saved with relevant fields. |
| FR-03 | Product record has storage, dates, packaging/material, and end-of-life fields where relevant | P0 | Information is visible in the consumer view; missing values are not fabricated. |
| FR-04 | Generate and resolve a QR identifier | P0 | A scan or clearly demonstrated scan simulation opens the correct record. |
| FR-05 | Consumer can add a product from QR or fallback entry | P0 | One known and one unknown/unavailable path are represented. |
| FR-06 | Personal voxel world with labelled storage/lifecycle zones | P0 | User can identify the zones and see product objects in them. |
| FR-07 | Actual location and recommended location are represented separately | P0 | UI exposes a mismatch and suggests a valid next action. |
| FR-08 | Product detail view and lifecycle action | P0 | User completes an event and the item/world state updates. |
| FR-09 | One contextual storage or lifecycle recommendation | P0 | Recommendation uses visible source data and explains its reason. |
| FR-10 | One reuse/recycling/disposal interaction | P0 | Guidance is tied to the record and has a visible completion state. |
| FR-11 | World feedback tied to a meaningful action | P0 | Visual change follows completion, not just scanning/opening. |
| FR-12 | Product 3D packaging preview | P1 | A selected package model can be inspected or shown as a polished prototype interaction. |
| FR-13 | Parameter-based packaging edit with updating model | P1 | At least one parameter visibly changes supported geometry. |
| FR-14 | Producer-side test/analysis display with disclosed limits | P1 | At least one selected test or comparison clearly labels assumptions and output type. |
| FR-15 | Configurable reminders based on available data and events | P1 | User can see, dismiss, or complete a reminder. |
| FR-16 | Inventory-aware pre-purchase prompt | P1 / Validate first | Prototype tests whether duplicate awareness is helpful rather than intrusive. |
| FR-17 | Compare two packaging designs | P2 | Comparison uses disclosed estimates or supported calculations. |
| FR-18 | Live sensor or appliance integration | P2 / Future | Not required for first prototype. |
| FR-19 | External producer, retailer, or recycling-system integrations | P2 / Future | Not required for first prototype. |

P0 items are a proposed minimum demonstration slice. A design-led high-fidelity prototype may simulate secondary workflows, provided the presentation clearly distinguishes simulated, preloaded, and genuinely functional elements.

## 10. Non-Functional Requirements

### 10.1 Clarity and usability

- Users should be able to identify the primary action in each screen without a lengthy explanation.
- Use text labels alongside terrain or colour cues.
- Keep the number of simultaneous panels, metrics, and coaches limited.
- Present product details in a predictable location regardless of 3D camera position.
- Provide list/detail alternatives for important tasks if the 3D world is difficult to navigate.

### 10.2 Accessibility

- Maintain readable type size and sufficient contrast.
- Do not communicate risk, status, or location by colour alone.
- Provide keyboard-accessible controls where feasible and clear focus states.
- Allow reduced motion or a less animated mode where feasible.
- Avoid making critical actions depend on precise drag gestures.

### 10.3 Performance and resilience

- Load a small set of sample 3D assets reliably on a typical laptop/browser.
- Provide loading, empty, invalid-QR, missing-data, and error states.
- Core sample flows should still be demonstrable if an optional AI API is unavailable.
- Use deterministic fallback rules for essential storage suggestions when possible.

### 10.4 Privacy and security

- Store only data necessary for the user-facing experience.
- Make it clear what consumer activity is retained.
- Do not expose private household inventory through a public QR link.
- Separate public product/batch data from private per-user item states and household events.
- Do not place sensitive user data directly in QR payloads.
- For the designathon prototype, use synthetic sample data unless real user data is genuinely needed and consented to.

### 10.5 Trust and scientific honesty

- Show the source of product facts when possible: producer supplied, user reported, sensor observed, calculated, or unknown.
- Label packaging calculations and simulations by their actual method and confidence.
- Do not claim verified waste reduction, increased shelf life, food safety, engineering protection, or environmental benefit without relevant evidence.
- Distinguish estimated indicators from certifications or measured outcomes.

## 11. Conceptual Data Model

This is a planning model, not a final database schema.

| Entity | Purpose | Example fields |
|---|---|---|
| Product Record | Shared product-level facts | product ID, name, category, image, dates, storage instructions, materials, reuse/disposal guidance |
| Batch / QR Record | Connects a code to a product or batch | QR identifier, linked product record, batch identifier, record version/status |
| Packaging Design | Producer-side packaging configuration | template, dimensions, materials, parameter values, design version, supported test summaries |
| Consumer Item | One individual item in one user’s world | item ID, user ID, product/QR reference, actual zone, recommended zone, opened date if relevant, current status |
| Lifecycle Event | A recorded item action | item ID, event type, timestamp, source (user/sensor/system), optional note |
| Recommendation / Reminder | An actionable prompt | trigger, message, source fields, due time, status, action link |
| User World State | World appearance and progression | user ID, unlocked elements, state derived from meaningful events |

A shared QR should normally resolve to shared product/batch information. Per-item events should belong to a private Consumer Item record. This avoids treating all units in a batch as if they share one household history.

## 12. Proposed Prototype Scope and Roadmap

### 12.1 Designathon demonstration slice

The first presentation should make the core idea legible in a short end-to-end story. Recommended scope:

1. Role selection.
2. A producer creates one sample product record with storage, date, material, packaging, and end-of-life information.
3. Producer generates a QR code linked to that record.
4. Consumer scans the code or uses a represented scan interaction.
5. Product appears in a personal voxel world.
6. Consumer marks the actual storage zone; the recommended zone remains distinct.
7. The UI shows one relevant mismatch or lifecycle need and explains what to do.
8. Consumer completes the action, sees item state update, and sees a corresponding world change.
9. Consumer completes one packaging reuse/recycling/disposal interaction.
10. If it strengthens the story and can be demonstrated convincingly, include a compact 3D package preview in Producer Studio.

Use two or three sample products that provide contrasting scenarios. A small, coherent set is better than a catalogue with shallow interactions.

### 12.2 Strong stretch scope

- Editable parameter-based packaging template and before/after comparison.
- One honest, clearly bounded packaging test/estimate.
- Product detail 3D view with packaging components.
- Reminder control and a meaningful dismissal/completion state.
- Candidate pre-purchase inventory check, if user validation supports it.
- Persistence between sessions where implementation time permits.

### 12.3 Longer-term possibilities

- Wider range of product categories and producer templates.
- Sensor-connected temperature or storage events.
- Retailer/product-database integrations and more universal QR support.
- Localised recycling/disposal guidance.
- More robust packaging physics and design optimisation with validation.
- Producer analytics and consumer-facing product lifecycle reports.

These are possibilities, not promises or MVP requirements.

## 13. Visual and Interaction Direction

### 13.1 Aesthetic

Use an original voxel-inspired, Minecraft-like visual language rather than copying proprietary assets, logos, interface patterns, or branding. The world should feel inviting and tactile while maintaining the clarity of a consumer product.

Possible visual language:

- distinct terrain identities for storage environments;
- products represented as readable objects or miniatures;
- subtle animations when an action changes state;
- a clean information panel for dates, source, actual/recommended state, and next actions;
- a small, consistent set of icons and labels;
- producer studio using a more precise design-workspace layout with a clear 3D canvas and a modest parameter panel.

### 13.2 Information hierarchy

Consumer priority order:

1. What is this item?
2. Where is it actually stored versus where should it be stored?
3. What action, if any, matters now?
4. What relevant date or instruction supports the action?
5. What happens to its packaging after use?

Producer priority order:

1. What product and packaging are being configured?
2. What constraints and attributes are known?
3. What does the current design look like?
4. What parameters can be changed?
5. What do the test/calculation outputs actually mean?
6. What data will consumers receive from the QR?

Avoid making the consumer screen look like a professional engineering dashboard. Avoid making the producer screen look like a game world if that reduces precision or readability.

### 13.3 World metaphor test

Themed terrain is a design hypothesis, not a requirement to force every storage instruction into fantasy geography. Test whether users can infer the action quickly. If “forest” is misunderstood as outdoor storage or “Iceland” is not understood as a freezer, use clearer labelled structures while preserving the aesthetic.

## 14. User Research and Empathy Mapping Plan

The problem statement specifically expects user research and empathy mapping/analysis. This section is a plan, not completed research.

### 14.1 Exploratory research

Start with a small exploratory group of plausible consumers and, if feasible, one or more producer/packaging stakeholders. A small sample can uncover usability and language issues but cannot establish population-wide behaviour or impact.

Ask about recent, concrete behaviours rather than leading questions:

- What is the last product they forgot to use or discarded earlier than they intended?
- Have they bought something they already had? What happened immediately before that decision?
- How do they currently remember dates or storage instructions?
- What information do they look for on packaging, and what is hard to understand?
- What do they normally do with packaging after use?
- What makes reuse inconvenient or unsafe in some situations?
- How do reminders fit into their day, and when do they ignore them?
- Would they trust a virtual representation of their household inventory? What would make it feel too burdensome?

For producer/packaging participants:

- What product information do they already maintain?
- Which fields can they confidently expose to consumers?
- What does their packaging design/review workflow look like?
- What would a QR-linked record need to do to be useful?
- Which packaging tests or claims require formal validation?

### 14.2 Empathy map

Build an evidence-backed empathy map with **Says, Thinks, Does, and Feels**, and label the source of each observation. Separate direct quotes from interpretations. Add tensions and contradictions; do not force a neat narrative if evidence differs across people.

### 14.3 Journey map

Map the selected behaviour through a real context: trigger, current workaround, decision point, barrier, action, immediate result, and delayed result. Choose one or two moments where this concept can materially improve the experience.

### 14.4 Prototype validation

Give users concrete tasks without first explaining the intended solution. Observe whether they can:

- add a product;
- identify actual versus recommended storage;
- interpret the key instruction;
- complete the next action;
- find the packaging’s reuse/end-of-life guidance;
- explain what the world change signifies.

Record confusion, task completion, time, missed information, and user reasoning. A positive reaction to visual style is not sufficient evidence that the product solves the behaviour problem.

### 14.5 Evidence hygiene

Keep a simple evidence log with: observation, source, confidence, design implication, and open question. Clearly separate user quotes, team assumptions, and design decisions. Do not report a hypothetical persona as research or claim long-term behaviour change based on a short prototype test.

## 15. Success Measures

### 15.1 Prototype-level measures

Use these to evaluate whether the design communicates and supports its intended behaviour:

- Can a participant complete the core QR-to-action journey without verbal help?
- Can a participant explain the difference between actual and recommended storage?
- Can they correctly identify the source of a product fact or recommendation?
- Do they understand the next action and why it matters?
- Can they find the correct reuse/disposal information?
- Does world feedback reinforce the intended action rather than reward scanning or purchasing?
- Which screen or interaction produces the most confusion or abandonment?

Record actual results rather than pre-populating success claims.

### 15.2 Longer-term impact metrics to study later

Potential indicators include unnecessary duplicate purchases avoided, proportion of tracked items used before the relevant date, completion of appropriate storage actions, packaging reused or correctly sorted, and changes in self-reported habits. These would require a suitable study design, definitions, and reliable data collection. The prototype must not claim quantified environmental impact without evidence.

## 16. Risks, Limitations, and Mitigations

| Risk | Why it matters | Mitigation / evaluation question |
|---|---|---|
| The world is a visual gimmick | Engagement may not lead to better decisions | Tie state changes to meaningful actions; test whether users understand and act on advice. |
| Too much scope | Producer engineering tools and consumer world may feel like two unfinished products | Prioritise one connected story; keep stretch features visibly optional. |
| QR adoption barrier | Consumers cannot retrieve rich producer metadata if no compatible record exists | Provide a fallback add flow; use controlled sample records for the demo; treat large-scale adoption as an open dependency. |
| QR does not reveal real conditions | Could create false confidence about storage or safety | Show actual, recommended, and unknown states separately; accept user input or future sensors for condition data. |
| Batch/item ambiguity | One product QR may apply to many units with different histories | Create a per-user, per-item record after scanning. |
| Misleading safety/freshness advice | Wrong confidence may affect important decisions | Do not infer food safety from a QR/date alone; distinguish instructions, reminders, and uncertain estimates. |
| Inaccurate recycling advice | Disposal rules vary by location and material composition | Display source/limitations; avoid universal claims without localised support. |
| Misleading packaging tests | Attractive simulations may be mistaken for validated engineering | Name the method and assumptions; do not overstate accuracy. |
| Producer onboarding friction | Two-sided model depends on upstream data | Keep producer authoring lightweight; validate what information producers can provide. |
| Consumer data sensitivity | Household inventory and routines can be personal | Keep user state private; collect minimal data; never put it in public QR payloads. |
| Gamification creates perverse incentives | Users may scan/buy more or feel guilty | Reward completion of beneficial actions, not purchase volume; avoid shame and streak pressure. |
| Metaphor confusion/accessibility | Terrain or colour may obscure practical guidance | Use direct labels, accessible controls, and a list/detail fallback. |
| Weak evidence | Team may overclaim behavioural or environmental benefits | Conduct user research and prototype task testing; report limitations honestly. |

## 17. Open Questions That Should Remain Open Until Evaluated

1. **Initial category:** Should the initial use case focus on packaged groceries/fresh produce, household consumables, or a broader range? Food gives storage and date guidance a natural role, but may narrow the brief’s wider consumption challenge.
2. **Core behaviour:** Which single behaviour is the primary target: preventing duplicate/impulse purchases, reducing forgotten/unused products, improving storage/use, or improving reuse/disposal?
3. **Producer role:** Is Producer Studio essential to the best designathon story, or should it be a smaller data-authoring tool behind a more consumer-centred experience?
4. **World structure:** Should each user have a complete 3D world, or would a smaller set of interactive zones communicate the idea with less friction?
5. **Consumer 3D testing:** Does letting consumers run producer-style packaging tests enable a real decision, or is viewing package composition and disposal guidance more useful?
6. **Pre-purchase check:** Does an inventory-aware prompt feel helpful and timely, or intrusive and overly controlling?
7. **Proof of behaviour change:** What could be responsibly demonstrated in a short designathon test, and what would require longitudinal research?
8. **Naming:** What name best expresses the behaviour-change value without implying that the product is only about packaging or only about a game?

## 18. Recommended Jury Demonstration Narrative

A short, coherent scenario is recommended; its job is to show the idea, not every feature.

1. **Producer moment:** A producer creates a sample product record, enters practical storage and packaging information, previews the supported package, and generates a QR code.
2. **Handoff:** The QR-linked record is shown to be the bridge between producer-supplied information and the consumer experience.
3. **Consumer moment:** A user scans the product. It appears in a separate personal voxel world. The user confirms where the product is actually stored.
4. **Decision moment:** The interface reveals a relevant difference between the actual and recommended state, or another timely lifecycle action. The product-specific reason is visible.
5. **Real action and feedback:** The user moves the product or records an appropriate action. The item’s status updates and the world reflects the completion.
6. **Lifecycle closure:** The user sees the package’s material information and completes a suitable reuse, recycling, or disposal path.
7. **Evidence and humility:** Close by explaining which parts work in the prototype, which outputs are estimates, what user research has revealed, and what remains to be validated.

A pre-purchase scenario may replace or complement one of these steps if research suggests that impulse or duplicate purchasing is the clearest behavioural target. Do not force every feature into the same demo.

## 19. Explicit Non-Goals for the Initial Prototype

Unless later evidence changes the priorities, the first prototype does not need to:

- support every consumer product category;
- work with every QR code or product database;
- track actual temperature or physical product condition without data sources;
- generate arbitrary manufacturing-ready CAD geometry;
- claim validated engineering-grade packaging simulations;
- predict food safety, spoilage, or precise shelf life;
- provide universally correct local recycling rules without local data;
- integrate with retailers, smart refrigerators, or sensor networks;
- prove long-term waste reduction from a short demo;
- make all consumer and producer screens fully production-ready.

These are deliberate boundaries, not reasons to remove the ambition from the long-term concept.

## 20. Final Summary

Product Lifecycle World proposes a two-role, QR-linked lifecycle experience that uses a personal voxel world to turn producer-supplied product information into consumer actions. Its main opportunity is the combination of a distinctive visual metaphor, a shared product record, lifecycle interaction, and visible feedback for responsible choices. Its central challenge is proving that the world improves real decisions rather than merely making sustainability more entertaining.

For a designathon, the recommended approach is to preserve the distinctive creative vision while making one end-to-end behaviour-change journey clear, usable, and research-informed. Keep ambitious 3D packaging and testing capabilities as part of the wider concept, but present their actual implementation and confidence accurately. Treat the target audience, initial product category, core behaviour, and value of the producer-side experience as questions to validate—not facts already established.