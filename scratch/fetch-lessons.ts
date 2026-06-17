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
  console.log(`Found User ID: ${userId} for ${email}`);

  // Fetch all agents
  const agents = await drizzle
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.userId, userId));

  console.log(`\n--- Active Agents (${agents.length}) ---`);
  
  for (const agent of agents) {
    console.log(`\n==================================================`);
    console.log(`Agent: ${agent.name} (ID: ${agent.id})`);
    console.log(`Role: ${agent.role} | Channel: ${agent.channel} | Vibe: ${agent.personalityVibe}`);
    console.log(`Greeting: "${agent.firstMessage}"`);

    // Fetch personality
    const [pers] = await drizzle
      .select()
      .from(schema.personality)
      .where(and(eq(schema.personality.agentId, agent.id), eq(schema.personality.userId, userId)))
      .limit(1);
    console.log(`\nPersonality: ${pers ? pers.content.slice(0, 150) + "..." : "None"}`);

    // Fetch directives (rules)
    const directives = await drizzle
      .select()
      .from(schema.directives)
      .where(and(eq(schema.directives.agentId, agent.id), eq(schema.directives.userId, userId)));
    console.log(`Directives (${directives.length}):`);
    directives.forEach((d, i) => console.log(`  ${i+1}. [P${d.priority}] ${d.content}`));

    // Fetch knowledge (facts)
    const knowledge = await drizzle
      .select()
      .from(schema.knowledge)
      .where(and(eq(schema.knowledge.agentId, agent.id), eq(schema.knowledge.userId, userId)));
    console.log(`Knowledge/Facts (${knowledge.length}):`);
    knowledge.forEach((k, i) => console.log(`  ${i+1}. ${k.content}`));

    // Fetch unpromoted lessons (observations)
    const lessons = await drizzle
      .select()
      .from(schema.agentLessons)
      .where(and(eq(schema.agentLessons.agentId, agent.id), eq(schema.agentLessons.userId, userId)));
    console.log(`Unpromoted Observations/Lessons (${lessons.length}):`);
    lessons.forEach((l, i) => console.log(`  ${i+1}. [ID: ${l.id}] ${l.lesson}`));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
