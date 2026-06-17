import "dotenv/config";
import { drizzle } from "../src/lib/server-context";
import * as schema from "../src/db/schema";
import { resolveFounderUserId } from "../src/lib/founder-fleet-seed";
import { eq, and } from "drizzle-orm";

async function main() {
  const email = "mikelaurenzo7@gmail.com";
  const userId = await resolveFounderUserId(email);
  if (!userId) {
    console.error(`User not found for email: ${email}`);
    process.exit(1);
  }

  const agents = await drizzle
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.userId, userId));

  const report = [];

  for (const agent of agents) {
    const [pers] = await drizzle
      .select()
      .from(schema.personality)
      .where(and(eq(schema.personality.agentId, agent.id), eq(schema.personality.userId, userId)))
      .limit(1);

    const directives = await drizzle
      .select()
      .from(schema.directives)
      .where(and(eq(schema.directives.agentId, agent.id), eq(schema.directives.userId, userId)));

    const knowledge = await drizzle
      .select()
      .from(schema.knowledge)
      .where(and(eq(schema.knowledge.agentId, agent.id), eq(schema.knowledge.userId, userId)));

    const lessons = await drizzle
      .select()
      .from(schema.agentLessons)
      .where(and(eq(schema.agentLessons.agentId, agent.id), eq(schema.agentLessons.userId, userId)));

    report.push({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      channel: agent.channel,
      voiceId: agent.voiceId,
      voiceProvider: agent.voiceProvider,
      personality: pers ? pers.content : null,
      directivesCount: directives.length,
      knowledgeCount: knowledge.length,
      lessonsCount: lessons.length,
      lessons: lessons.map(l => ({ id: String(l.id), lesson: l.lesson }))
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
