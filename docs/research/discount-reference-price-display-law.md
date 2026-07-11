# Discount & reference-price display law (EU Omnibus + Swedish Prisinformationslagen)

Research for [#40](https://github.com/nksfrank/joyofcreativity/issues/40), part of the store-transaction map [#28](https://github.com/nksfrank/joyofcreativity/issues/28).

**Not legal advice.** This establishes the legal shape of the constraint so the pricing/display model can be designed. A Swedish jurist / Konsumentverket-aware review is required before launching any "was X, now Y" display.

## TL;DR / recommendation

- The rule is **triggered by announcing a reduction**, not by displaying two prices. It only bites when we advertise a discount — "rea", "-20%", a struck-through "ordinarie pris", "nu bara …", etc.
- When it is triggered, the reference ("tidigare pris" / prior price) we show **must be the lowest price *we* actually charged for that product in the ≥30 days before the reduction**, and any percentage must be **calculated from that lowest price** (CJEU *Aldi Süd*, C-330/23, 26 Sep 2024). Not the last price, not an RRP, not a made-up "ordinary" price.
- The trader must be able to **prove** the reference price was genuinely applied. Konsumentverket has enforced against traders who couldn't. Proof means a **timestamped price history per product**.
- **An always-on struck-through "compare-at" price is not viable.** A permanent "original price" that is never actually charged is a fictitious reference and breaches both Prisinformationslagen 7 a § and Marknadsföringslagen. If we want compare-at display, it must be a real, time-bounded reduction backed by price history.
- **Offer duration**: no hard statutory maximum, but an offer is effectively time-bounded — Konsumentverket guidance says a *realisation* should run no more than "a few weeks", and the 30-day-lowest rule self-erodes any long reduction. So prices must be modelled as **time slots** (effective-from/-to), not a single current scalar. See [Offer duration & time-boxing](#offer-duration--time-boxing-can-an-offer-only-last-30-days).
- **Data-model consequence**: a compliant compare-at requires **effective-dated price-period tracking** (per product, per currency, with start/end) so the 30-day lowest price is derivable and provable *and* offers expire. This does **not** fit the current thin, code-defined static pricing model, which has no notion of *when* a price was in effect. See [Impact on our pricing model](#impact-on-our-pricing-model).
- **Cheapest compliant path**: don't ship compare-at yet. Sell at a single current price (no reduction claim → rule not triggered). Add compare-at only as a deliberate future feature, together with the price-history substrate it needs.

## The EU rule: Price Indication Directive 98/6/EC, Article 6a (inserted by Omnibus 2019/2161)

- **Trigger**: "any announcement of a price reduction". A price reduction is a comparison the trader makes against a *previous* price they applied — struck-through prices, percentages, "sale", "was/now".
- **Core obligation**: the announcement "shall indicate the *prior price* applied by the trader for a determined period of time prior to the application of the price reduction."
- **Definition of prior price**: "the **lowest price applied by the trader during a period of time not shorter than 30 days** prior to the application of the price reduction." (Art. 6a(2))
- **Transposition deadline** 28 Nov 2021; **in force from 28 May 2022** across the EU.
- **Scope note**: the rule concerns *the trader's own* previous price. Comparisons to a manufacturer's recommended retail price (RRP/"rek. pris") or a competitor's price are **not** "price reductions" under 6a — but they are still policed as potentially misleading under general unfair-commercial-practices law (in Sweden, Marknadsföringslagen). So RRP-style compare-at doesn't escape the problem, it just moves to a different statute.

### Member-State-optional exceptions (Art. 6a(3)–(5))

These are permissions for Member States, so what matters is the **Swedish** transposition, not the directive's menu:

1. **Perishable / short-shelf-life goods** — Member States may exempt goods "liable to deteriorate or expire rapidly" (fresh food, flowers, short-date drinks). *Not relevant to us — hand-knit goods don't perish.*
2. **New products (<30 days on the market)** — a shorter reference period may be allowed for goods the trader has sold for less than 30 days. *Relevant for freshly-listed products* if we ever run a launch discount.
3. **Progressive/gradual reductions** — where a reduction is *continuously increased* within one uninterrupted campaign, the prior price may stay fixed at the lowest price in the 30 days before the *first* step. EU guidance caps this at ~3 months. *Edge case; ignore for now.*

### CJEU C-330/23 — *Verbraucherzentrale Baden-Württemberg v Aldi Süd* (26 Sep 2024)

The decisive recent ruling. Aldi showed a percentage / "price highlight" computed from the *most recent* price rather than the 30-day low. The Court held:

- A price-reduction **percentage must be calculated from the lowest price of the last 30 days**, not from the immediately-preceding price.
- It is **unlawful to headline a price as a "highlight"/best-price** if that figure is higher than the 30-day low.

Upshot: it is not enough to *display* the 30-day-low figure somewhere; the **advertised saving itself** (the %, the "-X kr", the emphasis) must be anchored to it. This closes the "reset the reference the day before the sale" loophole definitively.

## The Swedish transposition: Prisinformationslagen (2004:347) 7 a §

- Sweden implemented Omnibus via **7 a § prisinformationslagen**, in force **from the same 2022 window**. Enforcement and interpretation sit with **Konsumentverket / Konsumentombudsmannen (KO)**, with **Marknadsföringslagen (2008:486)** as the misleading-marketing backstop.
- **The rule (Konsumentverket wording)**: when marketing something as a price reduction, the trader must state the **tidigare pris = "the lowest price the trader applied for the product during the 30 days before the reduction."** A stated percentage must be computed from that lowest price (Konsumentverket explicitly cites *C-330/23*).
- **Exception actually taken in Sweden**: the prior price need **not** be shown for goods that quickly deteriorate/age (plants, fresh food, short-date drinks). No general "new product" carve-out to rely on beyond the directive's optional shorter-period logic; treat launch discounts cautiously.
- **Enforcement stance (proof burden on the trader)**: Konsumentverket ran supervisory sweeps in 2023 on 7 a § compliance. In at least one case it found the trader **could not prove** the struck-through price equalled the lowest price actually charged in the prior 30 days — the investigation showed the product had in fact been sold cheaper. The takeaway is a hard requirement: **the reference price is only defensible if we hold the price history to back it.**

## Offer duration & time-boxing (can an offer only last 30 days?)

Short answer: **no hard statutory cap**, but an offer is nonetheless effectively **time-bounded**, and pricing must be modelled as **time slots** (validity intervals), not a single current scalar.

- **EU**: there is no explicit maximum length for a sale. The 30 days is the *reference look-back*, not an offer-length limit. Two mechanisms bound duration indirectly: (1) the **progressive-reduction** allowance is capped at ~3 months; (2) the 30-day-lowest rule **self-erodes** a long reduction — once the reduced price has been charged for 30+ days it *becomes* the 30-day low, so a "was X / now Y" claim stops being true. A perpetual "sale" is, in law, not a reduction at all (and separately misleading).
- **Sweden (Konsumentverket)**: **no absolute time limit** in statute, but published guidance states a *realisation* should not run longer than "a few weeks" (*några få veckor*), and sale periods across a full year should not total more than "a couple of months". Konsumentverket also notes there is currently **no case law** precising an exact maximum — so this is soft guidance, not a bright line.

**Data-model consequence (reinforces the price-history requirement).** Because reductions are bounded intervals and the reference price is derived over a *past window*, a price cannot be a single scalar with an optional struck-through number. Prices must be **time slots**: each price (regular or reduced) is a record with an **effective-from** and (for offers) an **effective-to**. This is the same substrate as the 30-day-low proof requirement, seen from the other side — backward-looking (prove the reference) *and* forward-looking (schedule/expire an offer). Practically:

- `price_history` becomes **effective-dated price periods** per product/currency, not just an append-only log of changes.
- An "offer" is a period with a bounded end; the UI must stop advertising the reduction when the period ends (and, per the erosion rule, a reduction can't simply be renewed indefinitely against the same higher reference).
- The 30-day-low is `min(price)` over the periods overlapping `[now-30d, now)`.

## Two legal layers: display mechanic vs. campaign-marketing rules

A crucial distinction that determines how much of this we actually touch. Duration and frequency are **not** governed by the Omnibus 30-day rule — they come from a separate statute.

**Layer 1 — Prisinformationslagen 7 a § (Omnibus display mechanic).** Applies to *any* announced reduction. Governs only *what reference number is shown*: the 30-day low, % calculated from it (see above). Says **nothing** about how long or how often you may run offers.

**Layer 2 — Marknadsföringslagen (MFL) + Market Court (Marknadsdomstolen) practice (misleading-marketing).** This is what limits **duration and frequency**, and it attaches to the *words* used — "REA", "realisation", "extrapris", "fyndpris". Key practice (guidance-grade, **not** bright-line statute — much of it pre-Omnibus, and Marknadsdomstolen was folded into Patent- och marknadsdomstolen in 2016):

- To use "rea/realisation/extrapris": goods must be in the **regular assortment**, the sale **time-limited**, and prices **significantly below** normal.
- **Duration**: a rea should last "a few weeks", in any case **not more than ~2 months**; a "realisation" claim is misleading if sales total more than **~2 months of the year** on the same goods.
- **Ordinary price between offers**: the regular price must have genuinely applied ~**4 continuous weeks** (in direct connection to the sale) to count as "ordinarie". After ~4 weeks at the low price, the low price *becomes* the ordinary price.
- **Frequency / bouncing**: repeatedly putting the **same** product on sale breaches the time-limit rule — the sale price becomes the de-facto normal price and the "ordinary price" is then fictitious (misleading). Rotating **different** goods each campaign is fine. Konsumentverket enforced against a struck-through price never actually charged across 5 months.

**Answering the cadence question directly.** How often a product may bounce between ordinary and offer price is bounded by (a) the ordinary price must be genuinely applied ~4 weeks between reductions, and (b) total rea on the same product should stay under ~2 months/year — beyond that the "ordinary" price is fictitious and the marketing misleading.

**Scope implication.** Layer 2 only bites once we run **recurring campaigns with "rea"-type marketing language** — which is exactly the map's out-of-scope **Promotions** (codes/campaigns/gift cards). A single, genuine, one-off compare-at triggers essentially only Layer 1. So: a plain one-off reduction is a *pricing-model + display* question (in principle in scope, needs time slots); recurring "rea" campaigns are a *Promotions* question (out of scope). This reinforces the recommendation to **defer compare-at** — the further it goes, the more it becomes Promotions, not a display toggle.

## Impact on our pricing model

Current state (per map Notes / `src/libs/product.ts`): catalog is **hardcoded fixtures**, pricing engine is **pure and static** — a product/blank maps to a current price. There is **no temporal dimension**: the model cannot answer "what was the lowest price of this product between date A and date B."

A compliant compare-at feature needs exactly that temporal dimension. Concretely it requires:

- **Effective-dated price periods** (time slots): `(product/blank id, price in minor units, currency, effective-from, effective-to)` — so the lowest price over any 30-day window is derivable and auditable *and* an offer has a bounded end (see [Offer duration & time-boxing](#offer-duration--time-boxing-can-an-offer-only-last-30-days)). This is the "provable reference price" Konsumentverket demands, plus the scheduling the bounded-offer rule implies.
- **A derivation at display time**: reduction % and "tidigare pris" computed from `min(price over [now-30d, now))`, per currency (SEK/EUR are separate series — a EUR low can't reference an SEK price).
- Because pricing is currently **code/fixtures**, price changes are git commits with no runtime timestamp of when they took effect in production. Price history therefore needs a **runtime home** — and D1 is where mutable, timestamped, per-product rows already live for this effort (stock + orders, per [#30](https://github.com/nksfrank/joyofcreativity/issues/30)). A `price_history` table (or a price-change event log) alongside `stock` is the natural fit; it does **not** belong in the isomorphic `src/libs/` model, which must stay pure per ADR-0003.

This is a genuine feedback into persistence ([#30](https://github.com/nksfrank/joyofcreativity/issues/30)) and the pricing model, exactly as [#28](https://github.com/nksfrank/joyofcreativity/issues/28)'s fog line anticipated: compare-at is **not** a free display choice.

### Feasibility verdict

- **Compare-at within today's thin static model: not feasible compliantly.** The model has no price-over-time, and a static struck-through "original price" is precisely the fictitious reference the law targets.
- **Compare-at is feasible** if (and only if) we add the price-history substrate above and treat every reduction as a real, time-bounded event anchored to the 30-day low. That is a deliberate feature with its own data model, not a display toggle.
- **Recommended scope for the current effort**: keep the destination lean — **ship single current-price display, no reduction claims** (rule untriggered). Defer compare-at to a follow-on effort that co-designs it with `price_history` in D1. If a launch/seasonal sale is wanted sooner, it can be done compliantly *manually* for a handful of products only if we can evidence the 30-day-low prior price — but that evidence is the price history, so we're back to needing it.

## Open items needing human / legal sign-off

1. **Confirm current 7 a § wording and any 2024–2026 Konsumentverket ställningstagande updates** post-*Aldi Süd* — the exact Swedish text and latest guidance should be read directly (see sources) before implementation.
2. **RRP / "rek. pris" comparisons** (if ever wanted) — sit under Marknadsföringslagen misleading-marketing rules, not 7 a §; need separate assessment.
3. **Progressive-reduction and new-product edge rules** — only if we plan campaigns that use them; not needed for a static single-price launch.

## Sources

- [European Commission — Price Indication Directive](https://commission.europa.eu/law/law-topic/consumer-protection-law/unfair-commercial-practices-and-price-indication/price-indication-directive_en)
- [EU guidance on interpretation/application of Article 6a (2021/C 526/02)](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:52021XC1229(06))
- [CJEU Case C-330/23 *Aldi Süd* — EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A62023CJ0330)
- [White & Case — New ECJ judgement on the Price Indication Directive](https://www.whitecase.com/insight-alert/new-ecj-judgement-price-indication-directive-implications-online-retailers-and)
- [Bird & Bird — Transparency of price reductions in the EU](https://www.twobirds.com/en/insights/2025/global/transparency-of-price-reductions-a-closer-look-at-the-legal-framework-in-the-eu)
- [Konsumentverket — Prissänkningar: regler för företag](https://www.konsumentverket.se/marknadsratt-foretag/prissankningar-regler-for-foretag/)
- [Konsumentverket — Prisinformationslagen (företag)](https://www.konsumentverket.se/for-foretag/prissattning-och-ta-betalt/prisinformationslagen/)
- [Prisinformationslag (2004:347) — Sveriges riksdag](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/prisinformationslag-2004347_sfs-2004-347/)
- [Advokatfirman Delphi — Nya konsumentregler för prisinformation](https://www.delphi.se/sv/tech-blog/nya-konsumentregler-information-om-prissankningar-och-erbjudanden/)
- [Konsumentverket — Ställningstagande angående information om prissänkningar](https://publikationer.konsumentverket.se/other/stallningstagande-angaende-information-om-prissankningar)
- [Konsumentverket — Rea och nedsatt pris: vad gäller?](https://www.konsumentverket.se/konsumentratt/rea-och-nedsatt-pris/)
- [Konsumentverket — Frågor och svar: prissänkningar](https://www.konsumentverket.se/marknadsratt-foretag/fragor-och-svar-prissankningar/)
- [Svensk Handel — Så får REA-begreppet användas](https://www.svenskhandel.se/prioriterade-fragor/konsumentratt/sa-far-rea-begreppet-anvandas/)
