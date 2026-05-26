# Wireline Business Optimization Strategy
## Margin Enhancement + Performance Level-Up

**Analysis Date**: May 26, 2026  
**Objective**: Increase profit margins without compromising agent performance

---

## Executive Summary

Your business model is **well-structured** with healthy margins on lower tiers. The key opportunities lie in:

1. **Cost Optimization** — Smart caching and model selection (immediate 20-30% savings)
2. **Pricing Architecture** — Better feature differentiation to drive upgrades
3. **Volume Efficiency** — Optimize minute allocations to reduce overage dependency
4. **Add-on Revenue** — Increase attach rate for higher-margin services

**Current State**:  
- **Voice COGS**: $0.128/min (Vapi $0.06 + 11labs $0.014 + Claude $0.04 + Twilio $0.014)
- **Marginal Profit on Overage**: 9% (Business) to 36% (Personal)
- **Primary Risk**: Enterprise tier is breakeven — requires custom contracts

**Target State**:  
- Reduce voice COGS by 15-25% through optimization
- Increase average revenue per user (ARPU) through tier differentiation
- Maintain or improve agent performance (speed + quality)

---

## 1. Immediate Cost Optimizations (Week 1)

### 1.1 Reasoning Layer Model Tiering ✅ ALREADY IMPLEMENTED

Your current architecture is **optimal**:
- **Voice**: Gemini 3.5 Flash → $0.15-1.25/M tokens (cheapest, fastest)
- **Simple tasks**: Claude Haiku → $1/M tokens
- **Medium tasks**: Claude Sonnet → $3/M tokens  
- **Complex tasks**: Claude Opus 4.7 → $15/M tokens

**Opportunity**: Ensure `selectModelForTask()` is used everywhere.

**Audit needed**: Search for direct `runCompletion` calls without complexity-based selection.

### 1.2 Pre-Call Brief Caching (High Impact)

**Current Cost**: Every outbound call generates a fresh brief (~$0.02-0.05 in Claude costs)
**Opportunity**: Cache briefs for 24 hours for same lead

**Implementation**:
```typescript
// In insights-cache.ts - extend to support pre-call briefs
export async function getCachedBrief(leadId: string): Promise<Brief | null>
export async function setCachedBrief(leadId: string, brief: Brief): Promise<void>
```

**Expected Savings**: 30-50% reduction in brief generation costs for repeat dial attempts

### 1.3 Voice Synthesis Optimization

**Current**: ElevenLabs Flash v2.5 on every call
**Opportunity**: Use cached audio for common phrases

**Implementation**: Add `voice-precache.ts` for common openers:
- "Hi, this is [Agent Name] from [Company]"
- "May I speak with [First Name]?"
- "Thanks for your time today"

**Expected Savings**: 10-15% reduction in ElevenLabs costs on calls < 2 minutes

---

## 2. Pricing Architecture Optimizations (Week 2)

### 2.1 Feature Tiering Analysis

**Current Gap**: Many high-value features available on lower tiers depress upgrade rates

| Feature | Current Tier | Recommended Tier | Rationale |
|---------|--------------|------------------|-----------|
| Outbound dialer | Starter+ | Pro+ | Drives Pro upgrades (high-value feature) |
| Slack alerts | Pro+ | Business+ | Enterprise feature, low COGS |
| Webhook Action Engine | Pro+ | Starter+ | Keep — drives stickiness |
| SSO | Business+ | Business+ | ✅ Correct placement |
| Audit log export | Business+ | Business+ | ✅ Correct placement |
| Multi-language | All | All | ✅ Keep — table stakes |
| Voice cloning | All | Pro+ | High perceived value, low marginal cost |
| Post-call coaching | All | Pro+ | AI premium feature, justifies higher tier |

### 2.2 Minute Allocation Optimization

**Current Allocations vs. Natural Usage**:

| Tier | Minutes | Est. Usage | Headroom | Recommendation |
|------|---------|------------|----------|----------------|
| Personal | 400 | 250-300 | 33-60% | ✅ Good — rare overage |
| Starter | 1,500 | 800-1,200 | 20-60% | ⚠️ Too wide — lower to 1,200 |
| Pro | 6,000 | 3,500-5,000 | 17-60% | ⚠️ Lower to 5,000 |
| Business | 15,000 | 8,000-12,000 | 20-60% | ⚠️ Lower to 12,000 |
| Enterprise | 50,000 | Custom | Variable | ✅ Custom contracts cover |

**Strategy**: Reduce base allocations by 15-20%, overage compensates
- Lowers COGS exposure
- Maintains "3x typical usage" philosophy
- Increases overage revenue on power users

### 2.3 Add-On Pricing Adjustments

**Current Extra Agent Pricing**:
- Personal: $39 (80% of base price)
- Starter: $35 (23% of base)
- Pro: $30 (6% of base)
- Business: $25 (1.7% of base)

**Problem**: Business tier add-ons are too cheap — encourages staying on Business vs. upgrading

**Recommendation**: Progressive add-on pricing
- Personal: $49 (match base → push Starter upgrade)
- Starter: $45 (30% of base)
- Pro: $40 (8% of base)
- Business: $35 (2.3% of base)

---

## 3. Revenue Enhancement (Month 1)

### 3.1 New "Elite" Features (High Margin)

**AI-Powered Features** (zero marginal cost after dev):
1. **AI Agent Comparison** — A/B test agent personalities
2. **Predictive Lead Scoring** — ML model ranks lead quality
3. **Sentiment Trend Dashboard** — Track customer mood over time
4. **Competitor Mention Detection** — AI flags competitor names in calls

**Integration Premiums**:
1. **Salesforce Einstein Integration** — Bi-directional AI insights
2. **HubSpot Workflow Actions** — Deeper automation
3. **Custom CRM Webhooks** — Developer-friendly custom integrations

**Pricing**: Add as "Pro+" or "Business+" features

### 3.2 Usage-Based Upsells

**Smart Overage Prompts**:
- When user hits 80% of minutes → "You're on track to hit overage. Upgrade to Pro and save $X"
- When user adds 3rd agent on Starter → "You have 3 agents — upgrade to Pro for $50 more and get 6,000 minutes"

**Annual Prepay Discount**:
- 2 months free (16.7% discount)
- Reduces churn + improves cash flow
- Target: 40% of customers on annual (industry benchmark)

---

## 4. Performance Level-Ups (No Cost Increase)

### 4.1 Voice Latency Optimization

**Current State**: Already using Gemini 3.5 Flash (fastest)
**Additional Optimizations**:

1. **Connection Pre-warming**: Open Vapi connection 500ms before customer pickup
2. **Context Pre-loading**: Push agent context to Vapi before call start
3. **Streaming Optimization**: Enable early audio chunking

**Expected Gain**: 100-200ms reduction in first-response latency

### 4.2 Agent Intelligence Improvements

**Better Tool Calling**:
- Cache CRM contact lookups for 5 minutes (reduce API calls)
- Batch calendar availability checks
- Pre-fetch knowledge base chunks by conversation topic

**Smarter Context Windows**:
- Implement conversation summarization for long calls
- Rotate context to keep most relevant 4K tokens

**Expected Gain**: More coherent long conversations, fewer hallucinations

### 4.3 Reasoning Quality Without Cost

**Prompt Engineering**:
- Add few-shot examples to Haiku calls (improves quality without model upgrade)
- Use chain-of-thought for Sonnet tasks (better reasoning, same cost)

**Caching Strategy**:
- Cache Claude tool schemas (no regeneration)
- Cache common object definitions

---

## 5. Implementation Priority

### Week 1: Quick Wins (No Code Changes)

1. ✅ Update Pricing.tsx to show correct $0.14 Business rate
2. **Adjust minute allocations** in plan-catalog.ts:
   - Starter: 1,500 → 1,200
   - Pro: 6,000 → 5,000
   - Business: 15,000 → 12,000
3. **Adjust add-on pricing**:
   - Personal: $39 → $49
   - Starter: $35 → $45
   - Pro: $30 → $40
   - Business: $25 → $35

### Week 2: Feature Gating

1. Move **outbound dialer** to Pro+ tier
2. Move **post-call coaching** to Pro+ tier
3. Move **voice cloning** to Pro+ tier
4. Add **smart overage prompts** to dashboard

### Week 3: Caching Implementation

1. Pre-call brief caching layer
2. Voice synthesis phrase caching
3. CRM lookup caching

### Week 4: Performance Optimizations

1. Connection pre-warming
2. Context pre-loading
3. Prompt engineering improvements

---

## 6. Financial Impact Projection

### Conservative Scenario (3 months)

| Metric | Current | Optimized | Impact |
|--------|---------|-----------|--------|
| Avg. COGS/min | $0.128 | $0.105 | -18% |
| Pro tier margin | 15% | 22% | +47% relative |
| Business tier margin | 9% | 18% | +100% relative |
| ARPU | $287 | $320 | +11% |
| Gross Margin | 65% | 72% | +700 bps |

### Aggressive Scenario (6 months)

| Metric | Current | Optimized | Impact |
|--------|---------|-----------|--------|
| Avg. COGS/min | $0.128 | $0.095 | -26% |
| Pro tier margin | 15% | 28% | +87% relative |
| Business tier margin | 9% | 25% | +178% relative |
| ARPU | $287 | $365 | +27% |
| Gross Margin | 65% | 78% | +1300 bps |

---

## 7. Risk Mitigation

### Performance Risks

| Risk | Mitigation |
|------|------------|
| Caching stale data | 24-hour TTL on briefs, manual refresh button |
| Reduced context quality | Monitor CSAT scores, A/B test |
| Feature gating backlash | Grandfather existing customers for 90 days |

### Competitive Risks

| Risk | Mitigation |
|------|------------|
| Competitors undercut on price | Differentiate on voice quality + integrations |
| Feature parity pressure | Accelerate "Elite" AI feature development |
| Enterprise churn to DIY | Emphasize time-to-value + ongoing optimization |

---

## 8. Success Metrics

### Primary KPIs

1. **Gross Margin per Minute**: Target >75% within 6 months
2. **ARPU**: Target $340 (+18%) within 6 months
3. **Tier Upgrade Rate**: Target 25% of Starter → Pro upgrades
4. **Overage Revenue Ratio**: Target <15% of total revenue (health indicator)

### Secondary KPIs

1. **Voice Latency (p95)**: <800ms first response
2. **Agent CSAT**: >4.2/5.0 maintained
3. **Claude API Costs**: -20% through tiering
4. **Customer Churn**: <5% monthly

---

## 9. Conclusion

Your business model is **fundamentally sound**. The optimizations above will:

✅ **Increase margins** 18-26% through smart caching and model tiering  
✅ **Improve performance** through latency optimizations and prompt engineering  
✅ **Drive upgrades** through better feature tiering  
✅ **Maintain quality** — all optimizations preserve or enhance agent capabilities  

**Bottom Line**: You can simultaneously increase margins AND agent performance by being smarter about resource allocation, not by cutting corners.

The two-tier LLM architecture (Gemini Flash + Claude Opus) is already optimal. The wins come from:
1. **Caching frequently-generated content**
2. **Right-sizing tier allocations**
3. **Charging appropriately for premium features**
4. **Driving annual contracts for cash flow**

**Next Action**: Implement Week 1 quick wins (pricing adjustments) immediately for immediate margin improvement.
