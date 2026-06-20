export interface BlogPostRecord {
  id: string;
  title: string;
  date: string;
  author: string;
  excerpt: string;
  body: string;
  readingTimeMinutes: number;
}

function estimateReadingTime(body: string) {
  const words = body
    .replace(/^#+\s+/gm, "")
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(3, Math.round(words / 220));
}

function createPost(post: Omit<BlogPostRecord, "readingTimeMinutes">): BlogPostRecord {
  return {
    ...post,
    readingTimeMinutes: estimateReadingTime(post.body),
  };
}

export const BLOG_POSTS: BlogPostRecord[] = [
  createPost({
    id: "what-to-hand-off-to-a-call-assistant",
    title: "What is worth handing off to a call assistant?",
    date: "2026-06-20T09:00:00.000Z",
    author: "Wireline",
    excerpt:
      "A practical way to decide which calls are worth delegating: repetitive calls with a clear objective, a short list of facts to collect, and a result you can review.",
    body: `# What is worth handing off to a call assistant?

A call assistant is most helpful when the call itself is routine but still takes time. Think of the calls that put a small task on hold: checking whether a prescription is ready, asking an airline about a policy, confirming an appointment, or waiting on a customer-support line for a simple answer.

The best starting point is not the most complicated call on your list. It is the one you already know how to describe in one or two sentences.

## Start with a clear outcome

Before you delegate anything, write down what a successful call should return. A useful outcome might be an answer, a status update, an appointment option, or a request for a callback.

When the outcome is clear, the assistant has a job to do instead of an open-ended conversation to manage.

## Give it the facts you would say yourself

Most routine calls need a few details: a name, a reference number, a preferred time, a reason for calling, or a short explanation of the issue.

Keeping those details together makes it easier to set the assistant up well and easier to review the result afterwards.

## Keep important decisions with you

Some calls should stay in your hands. Avoid delegating decisions that require legal consent, financial approval, a medical judgement, or any step where you need to make a personal choice in the moment.

A good assistant is not a substitute for your judgement. It is a way to remove the waiting, repeating, and note-taking around a decision you still control.

## A simple test

Ask yourself three questions:

- Can I explain the goal of this call in one sentence?
- Can I list the facts the caller will need before the call starts?
- Would a short recap be enough for me to decide what happens next?

When the answer is yes, the call is a strong candidate to hand off.`,
  }),
  createPost({
    id: "how-to-set-boundaries-for-a-call-assistant",
    title: "How to set useful boundaries for a call assistant",
    date: "2026-06-19T09:00:00.000Z",
    author: "Wireline",
    excerpt:
      "The most useful rule set is usually the shortest one: what the assistant can do, what it must collect, and when it should stop and return the conversation to you.",
    body: `# How to set useful boundaries for a call assistant

Delegating a call should not mean giving away control. The practical way to use a call assistant is to set a small number of rules before it starts.

You do not need a long policy document. You need a clear definition of what the assistant is allowed to do and what it should bring back to you.

## Name the job

Give the assistant one job at a time. “Find the next available appointment” is clearer than “handle my doctor situation.” “Ask whether my order is ready for pickup” is clearer than “deal with customer support.”

A narrow job keeps the call focused and makes the outcome easier to verify.

## Decide what it can collect

List the details that matter to you. That might include available times, a reference number, a quoted price, a cancellation rule, or the name of the person who helped.

This turns the call into a useful handoff instead of a vague summary.

## Decide where it stops

Make the stop conditions obvious. For example: do not accept a charge, do not provide sensitive information beyond what is necessary, do not agree to a new contract, and ask for a callback when a decision needs your approval.

A stop condition is not a failure. It is a clean way to keep decisions in the right hands.

## Review the recap, not every word

For most routine work, you should not have to read a full transcript. The valuable part is the recap: what happened, what was learned, and what needs your attention next.

That is the standard to hold the experience to. The assistant should reduce the work around a call, not create a new pile of notes to manage.`,
  }),
  createPost({
    id: "why-a-good-call-recap-matters",
    title: "Why a useful recap matters more than a perfect transcript",
    date: "2026-06-18T09:00:00.000Z",
    author: "Wireline",
    excerpt:
      "The goal of a delegated call is not a word-for-word record. It is a concise answer to what changed, what was decided, and what needs your attention next.",
    body: `# Why a useful recap matters more than a perfect transcript

Most people do not want to replay a routine call. They want to know what happened without having to listen for the one useful sentence inside five minutes of hold music and back-and-forth.

That makes the recap the most important part of a delegated call.

## A recap should answer three things

A useful call recap tells you what the assistant learned, what it did, and what remains unresolved.

For a pharmacy call, that could be: the prescription is ready, the counter closes at six, and no action is needed. For a scheduling call, it could be: Tuesday at 2:30 is available, the office needs your insurance card, and you need to choose whether to book it.

## It should separate facts from next steps

Facts are things the other party confirmed. Next steps are things you still need to decide or do.

Keeping those separate makes a recap easier to trust and easier to act on quickly.

## It should preserve uncertainty

Sometimes the answer is incomplete. A good recap should say that plainly instead of making a guess sound final.

Clear uncertainty is more useful than false confidence. It tells you exactly where you may need to step back in.

## The point is less friction

A well-run assistant does not make a phone call disappear from history. It makes the useful part of the call easier to find.

That is what gives you time back: fewer holds, fewer repeated explanations, and less digging through notes after the fact.`,
  }),
];

export function getBlogPostBySlug(slug: string) {
  return BLOG_POSTS.find((post) => post.id === slug);
}
