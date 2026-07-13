---
name: design-intelligence
description: Design intelligence for UI and frontend work. Forces WHAT/WHY/HOW reasoning, mobile-first breakpoint analysis, and content-before-theme workflow. Every UI must be distinctive enough to shock. Never boring, never template-looking.
---

# Design Intelligence

Every UI you build should make the user think "someone actually designed this."
Not "an AI generated a template." The goal is not "acceptable" - it's
"how did they do that?"

## The Test

Before shipping any UI, ask: "Would a designer screenshot this and share it?"
If no, redo it. "Acceptable" is failure.

Signs of AI-generated UI:
- Perfectly symmetrical grids with identical cards
- Generic gradient backgrounds
- "Hero section + features grid + testimonials + CTA" formula
- Rounded corners on everything at the same radius
- Generic stock-photo-style placeholder content
- Every section looks like it came from a different template
- Looks fine on desktop, broken on mobile (didn't think mobile-first)

<HARD-GATE>
Before writing ANY UI code, you must answer in writing:

1. WHAT is this? (one sentence: what component/page, what's it for)
2. WHO sees it? (audience, context: dashboard vs landing vs mobile app)
3. WHY does each element exist? (if you can't justify it, remove it)
4. HOW does it behave on small screens? (write the breakpoint plan)
5. WHAT breaks first? (which element is most fragile when width shrinks)

If you cannot answer all five, you are not designing - you are generating.
</HARD-GATE>

## Content Before Theme - The Order

```
1. CONTENT - What information goes on this screen? List every element.
2. HIERARCHY - What's most important? Second? Third? Rank them.
3. LAYOUT - Where does each element go? (mobile layout FIRST, then desktop)
4. THEME - What style/palette/fonts express this content?
5. MOTION - What moves, why, and when?
```

Never pick colors before you know what's on the screen. Never pick fonts
before you know what the text says. Content determines theme, not the
other way around.

## Mobile-First Breakpoint Analysis (mandatory)

Before writing any CSS or JSX, write this out:

```
< 400px (tiny phone):
  - What hides? (secondary nav, sidebars, decorative elements)
  - What stacks? (side-by-side -> vertical)
  - What shrinks? (font sizes, padding, image heights)
  - Touch targets: minimum 44x44px, 8px gap between them

400-768px (phone/tablet):
  - What reappears? (secondary actions as bottom bar)
  - What reflows? (2-column where 1-column was)
  - Navigation: bottom tab bar or hamburger?

768-1024px (tablet):
  - Side-by-side layouts become viable
  - Sidebar can appear (collapsible)

> 1024px (desktop):
  - Full layout, multi-column grids
  - Hover states active (touch devices don't have hover)
```

The element that "breaks first" when width shrinks is the one you design
around. If a 3-column card grid breaks at 600px, you decide the reflow
BEFORE writing the desktop version.

## Project Design Identity (mandatory)

On a project's FIRST UI task:
1. Read the brief and audience. Propose ONE direction: a style (from
   references/styles/), a palette (from references/palettes.md), and a type
   pair (from references/font-pairings.md). One sentence each on why.
2. Get explicit user approval before writing any UI code.
3. Write the approved identity to `.lex/pages/design.md`: style name, the
   token block, palette hexes, font pair, and any project-specific overrides.

Every LATER UI task: load `.lex/pages/design.md` FIRST. The project identity
overrides the library. Never propose a new direction mid-project unless the
user asks for a redesign.

Brownfield projects (existing UI): do not propose a new direction - derive design.md
from the current interface (its actual tokens, type, spacing) and confirm it with the
user. If the user is unreachable (autonomous runs), write the proposal to design.md
marked `status: provisional` and flag it for approval instead of stalling.

## Loading Rule

Load at most: project design.md + ONE style page + the palette and font
entries you picked, + motion.md when the task involves animation or
transitions. Never bulk-load the references directory. Style pages live in
references/styles/ (neobrutalism, glassmorphism, brutalism, editorial,
swiss, claymorphism, bento, retro-terminal); palettes, font-pairings, and
motion are single files beside it.

## Design to Shock - Principles

- **Hierarchy**: one thing is clearly most important on every screen. If everything is equally prominent, nothing is.
- **Restraint**: 2-3 colors, 1-2 fonts, one consistent radius. Mastery is doing more with less.
- **One signature moment**: every screen should have ONE element that makes the user pause. A transition, a layout choice, a typographic decision. Not decoration - a deliberate "wow."
- **Density with purpose**: dense where it matters (dashboards, tables), roomy where it matters (landing pages, forms). Never uniformly spaced.
- **Consistency**: same component, same spacing, same shadow, same hover state everywhere
- **Motion communicates state change**, not decoration. If an animation doesn't explain something, remove it.
- **Tables for tabular data, cards for entity summaries, lists for sequential items** - never force one pattern onto all content
- **Dark mode and responsiveness**: match what the project already has, do not add either speculatively
- **Never add a UI library** the project doesn't already use without asking

## What Makes a UI "Shock" (in a good way)

| Boring (AI default) | Shocking (human design) |
|---|---|
| 3 identical feature cards in a row | Bento grid with varied sizes, one card 2x larger |
| Standard hero with centered text | Asymmetric hero with overlapping elements and depth |
| Uniform 8px radius on everything | Mixed radii: sharp images, rounded buttons, pill tags |
| Blue-to-purple gradient | Bold solid color with one unexpected accent |
| Inter font everywhere | Display font for headlines, clean sans for body |
| Fade-in on everything | Staggered entrance with directional motion |
| Standard 12-column grid | Broken grid with intentional misalignment |
| Hover: just changes color | Hover: lifts with shadow + subtle scale + color shift |

## Anti-Patterns - Never Do These

- Symmetrical card grids with identical content and identical spacing
- The "hero + features + testimonials + CTA" landing page formula
- Gradient text on headlines (instant AI tell)
- `backdrop-blur` on everything (glassmorphism is a choice, not a default)
- Stock illustrations from unDraw/Storyset
- `rounded-2xl` on every element regardless of context
- Centering everything (center alignment is the AI default - use left/right deliberately)
- Using every color in the palette (pick 2-3, use the accent sparingly)
- Animating on mount for every element (stagger only the first viewport)
- Forgetting `prefers-reduced-motion` (accessibility is not optional)

## Before Shipping - Checklist

1. Mobile layout tested? (< 400px, 400-768px)
2. One clear hierarchy? (most important element is obvious)
3. One signature moment? (something makes you pause)
4. No AI tells? (no gradient text, no identical card grids, no formula layout)
5. Touch targets >= 44px? (if mobile)
6. `prefers-reduced-motion` included? (if animated)
7. Matches project design.md? (if existing project)
8. Content is real, not "Lorem ipsum"? (placeholder content hides design problems)
9. Semantic HTML used? (not div soup - see SEO section)
10. Structured data present? (JSON-LD for the page type)
11. Core Web Vitals passing? (LCP < 2.5s, CLS < 0.1, INP < 200ms)
12. Silo structure respected? (internal linking follows topic clusters)

## SEO and GEO - Build for Both Engines

Search engines rank pages. AI engines (ChatGPT, Perplexity, Google AI Overviews)
cite sources. You must build for both. A beautiful page that nobody finds is
still a failure.

<HARD-GATE>
Before shipping any public-facing page, answer:
1. What query does this page answer? (the one search intent)
2. What entities does this page cover? (for AI engines to cite)
3. Is the HTML semantic? (h1, article, nav, footer - not div soup)
4. Is there structured data? (JSON-LD matching the page type)
5. Does the internal linking follow the silo? (topic cluster, not random links)

If you cannot answer all five, the page is not shippable.
</HARD-GATE>

### Semantic HTML - The Foundation

```html
BAD:  <div class="header"><div class="nav"><div class="title">About</div></div></div>
GOOD: <header><nav><h1>About</h1></nav></header>

BAD:  <div class="article"><div class="title">Post</div><div class="content">...</div></div>
GOOD: <article><h1>Post</h1><section>...</section></article>

BAD:  <div class="footer"><div class="links">...</div></div>
GOOD: <footer><nav>...</nav></footer>
```

Use the right element for the right job:
- `<header>` - site header or article header
- `<nav>` - navigation links only
- `<main>` - main content (one per page, excludes nav/footer)
- `<article>` - self-contained content (blog post, product page, doc page)
- `<section>` - thematic grouping with a heading
- `<aside>` - sidebar, related content, ads
- `<footer>` - site footer or article footer
- `<h1>` - ONE per page, matches the page title
- `<h2>`-`<h6>` - hierarchical, never skip levels
- `<figure>` + `<figcaption>` - images with captions
- `<time datetime="...">` - dates with machine-readable format
- `<address>` - contact info
- `<table>` with `<thead>`, `<tbody>`, `<th scope>` - tabular data only

### Structured Data (JSON-LD) - Mandatory for Public Pages

Every public page must include JSON-LD structured data. AI engines use this
to understand and cite your content. Put it in a `<script type="application/ld+json">`
tag in the `<head>`.

```json
// Article/Blog post
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "The Page Title",
  "author": { "@type": "Person", "name": "Author" },
  "datePublished": "2026-01-15",
  "dateModified": "2026-01-20",
  "image": "https://example.com/og-image.jpg",
  "articleBody": "First paragraph of content..."
}

// Product page
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Product Name",
  "description": "Product description",
  "offers": { "@type": "Offer", "price": "29.99", "priceCurrency": "USD" },
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.5", "reviewCount": "127" }
}

// FAQ page
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "Question text", "acceptedAnswer": { "@type": "Answer", "text": "Answer text" } }
  ]
}

// Organization (site-wide, on homepage)
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Company",
  "url": "https://example.com",
  "logo": "https://example.com/logo.png",
  "sameAs": ["https://twitter.com/company", "https://github.com/company"]
}

// BreadcrumbList (on every non-homepage)
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://example.com" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://example.com/blog" },
    { "@type": "ListItem", "position": 3, "name": "Post Title", "item": "https://example.com/blog/post" }
  ]
}
```

### Silo Structure - Topic Clusters

Organize content into topic silos. Each silo is a cluster of related pages
that link to each other and to a pillar page. This signals topical authority
to both search and AI engines.

```
Pillar: /features (broad overview, links to all sub-features)
  |
  +-- /features/auth (detailed, links back to pillar + siblings)
  |     +-- /features/auth/sso (links back to /features/auth + pillar)
  |     +-- /features/auth/oauth (links back to /features/auth + pillar)
  |
  +-- /features/billing (detailed, links back to pillar + siblings)
  |     +-- /features/billing/invoices
  |     +-- /features/billing/refunds

WRONG: random internal links with no topical grouping
WRONG: every page links to every other page (flat = no authority signal)
RIGHT: hierarchical clusters with contextual cross-links within the silo
```

Silo rules:
- Each silo has ONE pillar page (broad overview)
- Sub-pages link UP to the pillar and ACROSS to siblings in the same silo
- Sub-pages do NOT link to unrelated silos (use the pillar as the hub)
- The pillar links DOWN to all sub-pages
- Breadcrumbs reflect the silo hierarchy
- URL structure reflects the silo: `/silo/sub-topic/detail`

### Meta Tags - Every Public Page

```html
<title>Primary Keyword - Brand</title>  <!-- 50-60 chars, unique per page -->
<meta name="description" content="Compelling description with keyword.">  <!-- 150-160 chars -->
<link rel="canonical" href="https://example.com/page">  <!-- prevents duplicate content -->
<meta name="robots" content="index, follow">  <!-- or noindex for private pages -->

<!-- Open Graph (social sharing) -->
<meta property="og:title" content="Page Title">
<meta property="og:description" content="Page description">
<meta property="og:image" content="https://example.com/og-image.jpg">
<meta property="og:url" content="https://example.com/page">
<meta property="og:type" content="article">  <!-- or website, product -->

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Page Title">
<meta name="twitter:description" content="Page description">
<meta name="twitter:image" content="https://example.com/og-image.jpg">
```

### GEO - Generative Engine Optimization (for AI citations)

AI engines (ChatGPT, Perplexity, Google AI Overviews, Claude) cite sources
differently than search engines rank them. To get cited:

1. **Answer the question directly in the first paragraph** - AI engines extract
   the first clear answer. Don't bury it after 3 paragraphs of context.
2. **Use clear, factual statements** - "X is Y because Z" not "You might be
   wondering about X..."
3. **Include entity-rich content** - mention names, dates, numbers, specific
   facts. AI engines extract entities to match queries.
4. **Structure with headings that match questions** - "How to X", "What is Y",
   "Why does Z happen". AI engines match heading text to user questions.
5. **Provide unique data or analysis** - AI engines prefer citing original
   insights over content that repeats what 10 other pages already say.
6. **Keep content fresh** - include `dateModified` in structured data. AI
   engines prefer recent sources.
7. **Make content crawlable** - no JS-rendered content for critical text.
   Server-side render or static HTML for anything that should be cited.

### Core Web Vitals - Performance is SEO

Google uses Core Web Vitals as a ranking factor. Design decisions directly
affect these metrics:

- **LCP (Largest Contentful Paint) < 2.5s**: the largest visible element
  (usually hero image or headline) must load fast. Use `loading="eager"` +
  `fetchpriority="high"` on the LCP image. Avoid lazy-loading above the fold.
- **CLS (Cumulative Layout Shift) < 0.1**: no layout jumps. Set `width` and
  `height` on all images and videos. Reserve space for ads and embeds. Never
  insert content above existing content after load.
- **INP (Interaction to Next Paint) < 200ms**: responsive interactions. Keep
  event handlers lightweight. Debounce scroll handlers. Use `content-visibility:
  auto` for long pages.

### Image SEO

- `alt` text on EVERY image (describes the image for screen readers + SEO)
- `width` and `height` attributes (prevents CLS)
- `loading="lazy"` on below-the-fold images
- `fetchpriority="high"` on the LCP image
- WebP or AVIF format with `<picture>` fallback
- Descriptive filenames: `red-running-shoes.jpg` not `IMG_4821.jpg`

### SEO Rules

- NEVER use `<div>` where a semantic element exists (article, nav, header, etc.)
- NEVER have more than one `<h1>` per page
- NEVER skip heading levels (h1 -> h3 is wrong, h1 -> h2 -> h3 is right)
- NEVER render critical content with client-side JS only (AI crawlers don't execute JS)
- NEVER use `#` fragment URLs for navigable content (use real URLs)
- NEVER duplicate title tags or meta descriptions across pages
- NEVER use generic "Click here" or "Read more" link text (use descriptive anchors)
- ALWAYS include JSON-LD structured data on public pages
- ALWAYS use semantic HTML elements for their intended purpose
- ALWAYS follow the silo structure for internal linking
- ALWAYS set canonical URLs to prevent duplicate content issues
- ALWAYS include Open Graph + Twitter Card meta tags
- ALWAYS answer the primary question in the first paragraph (for AI citations)
- ALWAYS use descriptive, keyword-relevant URL slugs
- ALWAYS include `alt` text on every image
- ALWAYS set `width` and `height` on images to prevent CLS
