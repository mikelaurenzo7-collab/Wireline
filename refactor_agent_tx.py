import re

with open('/app/src/routes/agent-routes.ts', 'r') as f:
    content = f.read()

old_block = """      try {
        // Voice rotation: when the operator didn't pick a voice (template
        // deploys typically don't), assign one from the curated roster by
        // current agent count so the first 3 agents end up with 3 distinct
        // voices instead of all sharing the platform default. Operator can
        // override later in FleetSettings → Voice.
        const rotatedVoice = pickRotatedVoiceId(agentCount);
        const agentValues = {
          ...mapObjectToCamel(rest),
          id: agentId,
          userId: req.user.id,
          voiceId: rest.voice_id || rotatedVoice,
          channel: rest.channel || "voice",
          role: agentRole,
        };
        // Remove any fields that don't belong in the agents table
        delete (agentValues as any).personality;

        await drizzle.insert(schema.agents).values(agentValues);
      } catch (error: any) {
        log.error("Agent row insert failed", {
          userId: req.user.id,
          agentId,
          error: error.message,
        });
        return res.status(500).json({ error: "Failed to create agent" });
      }

      // Phone number is INCLUDED in every monthly tier — auto-provision a
      // Wireline number from our Twilio pool on the tenant's first agent
      // creation so they never wire Twilio themselves. Subsequent agents
      // on the same tier either reuse an unassigned number or refuse if
      // the tier's number cap is hit (operator sees a clear upgrade
      // prompt).
      //
      // Fire-and-forget: number provisioning takes ~1-2s end-to-end and
      // the agent-create response shouldn't block on Twilio. The agent
      // is fully functional without a number (voice falls back to the
      // Wireline Demo Line); the new number lands within 2s of the
      // tenant landing on the dashboard.
      void import("../lib/phone-provisioning")
        .then(({ provisionTenantNumber }) =>
          provisionTenantNumber(req.user.id, {
            agentId,
            campaignLabel: "auto-on-agent-create",
          }),
        )
        .then((result) => {
          if (!result.ok) {
            log.warn("Auto phone provisioning skipped", {
              userId: req.user.id,
              agentId,
              error: result.error,
            });
          }
        })
        .catch((err) =>
          log.warn("Auto phone provisioning errored", {
            userId: req.user.id,
            agentId,
            error: err?.message,
          }),
        );

      // Compose personality from layered templates + operator overrides:
      //   role base (deep methodology) + template overlay (tactic specifics)
      //   + operator custom (highest priority), with {{businessName}} etc.
      //   substituted from the operator's settings row.
      const rolePersonality =
        ROLE_PERSONALITY_TEMPLATES[agentRole as keyof typeof ROLE_PERSONALITY_TEMPLATES] ||
        (rest.channel === "email"
          ? "You are a professional email agent specialized in clear, efficient communication."
          : "You are a helpful assistant serving as a phone agent.");

      const businessContext = {
        businessName: (userSettings as any)?.businessName,
        businessType: (userSettings as any)?.businessType,
        operatingHours: (userSettings as any)?.businessHours,
        escalationContact: (userSettings as any)?.escalationContact,
        primaryProduct: (userSettings as any)?.primaryProduct,
      };

      const personalityContent = composeAgentPersonality({
        rolePersonality,
        templateId: typeof templateId === "string" ? templateId : null,
        operatorCustom: typeof personality === "string" ? personality : null,
        businessContext,
      });

      try {
        await drizzle.insert(schema.personality).values({
          agentId: agentId,
          userId: req.user.id,
          content: personalityContent,
        });
      } catch (error: any) {
        log.error("Agent personality insert failed", {
          userId: req.user.id,
          agentId,
          error: error.message,
        });
        await drizzle
          .delete(schema.agents)
          .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)));
        return res.status(500).json({ error: "Failed to create agent" });
      }

      res.status(201).json({ success: true, id: agentId });
    } catch (error: any) {"""

new_block = """      try {
        await drizzle.transaction(async (tx) => {
          const rotatedVoice = pickRotatedVoiceId(agentCount);
          const agentValues = {
            ...mapObjectToCamel(rest),
            id: agentId,
            userId: req.user.id,
            voiceId: rest.voice_id || rotatedVoice,
            channel: rest.channel || "voice",
            role: agentRole,
          };
          delete (agentValues as any).personality;

          await tx.insert(schema.agents).values(agentValues);

          const rolePersonality =
            ROLE_PERSONALITY_TEMPLATES[agentRole as keyof typeof ROLE_PERSONALITY_TEMPLATES] ||
            (rest.channel === "email"
              ? "You are a professional email agent specialized in clear, efficient communication."
              : "You are a helpful assistant serving as a phone agent.");

          const businessContext = {
            businessName: (userSettings as any)?.businessName,
            businessType: (userSettings as any)?.businessType,
            operatingHours: (userSettings as any)?.businessHours,
            escalationContact: (userSettings as any)?.escalationContact,
            primaryProduct: (userSettings as any)?.primaryProduct,
          };

          const personalityContent = composeAgentPersonality({
            rolePersonality,
            templateId: typeof templateId === "string" ? templateId : null,
            operatorCustom: typeof personality === "string" ? personality : null,
            businessContext,
          });

          await tx.insert(schema.personality).values({
            agentId: agentId,
            userId: req.user.id,
            content: personalityContent,
          });
        });

        void import("../lib/phone-provisioning")
          .then(({ provisionTenantNumber }) =>
            provisionTenantNumber(req.user.id, {
              agentId,
              campaignLabel: "auto-on-agent-create",
            }),
          )
          .catch((err) =>
            log.warn("Auto phone provisioning errored", {
              userId: req.user.id,
              agentId,
              error: err?.message,
            }),
          );

        res.status(201).json({ success: true, id: agentId });
      } catch (error: any) {
        log.error("Agent creation failed", {
          userId: req.user.id,
          agentId,
          error: error.message,
        });
        return res.status(500).json({ error: "Failed to create agent" });
      }
    } catch (error: any) {"""

content = content.replace(old_block, new_block)

with open('/app/src/routes/agent-routes.ts', 'w') as f:
    f.write(content)
