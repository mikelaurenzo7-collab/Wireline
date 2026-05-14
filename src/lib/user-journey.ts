import { drizzle } from './server-context';
import { eq, and } from 'drizzle-orm';
import { userPreferences, onboardingProgress } from '../db/schema';

export interface UserPreferences {
  user_id: string;
  persona?: 'new' | 'solo' | 'power' | 'technical' | 'non_technical';
  tour_completed: boolean;
  onboarding_completed: boolean;
  help_enabled: boolean;
  keyboard_shortcuts_enabled: boolean;
  preferences: Record<string, any>;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  try {
    const data = await drizzle
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (!data.length) {
      return {
        user_id: userId,
        tour_completed: false,
        onboarding_completed: false,
        help_enabled: true,
        keyboard_shortcuts_enabled: true,
        preferences: {},
      };
    }

    const row = data[0];
    return {
      user_id: row.userId,
      persona: row.persona as any,
      tour_completed: row.tourCompleted || false,
      onboarding_completed: row.onboardingCompleted || false,
      help_enabled: row.helpEnabled || true,
      keyboard_shortcuts_enabled: row.keyboardShortcutsEnabled || true,
      preferences: (row.preferences as any) || {},
    };
  } catch (error) {
    return {
      user_id: userId,
      tour_completed: false,
      onboarding_completed: false,
      help_enabled: true,
      keyboard_shortcuts_enabled: true,
      preferences: {},
    };
  }
}

export async function updateUserPreferences(
  userId: string,
  updates: Partial<UserPreferences>
): Promise<void> {
  const mapped: any = {};
  if (updates.persona) mapped.persona = updates.persona;
  if (updates.tour_completed !== undefined) mapped.tourCompleted = updates.tour_completed;
  if (updates.onboarding_completed !== undefined) mapped.onboardingCompleted = updates.onboarding_completed;
  if (updates.help_enabled !== undefined) mapped.helpEnabled = updates.help_enabled;
  if (updates.keyboard_shortcuts_enabled !== undefined) mapped.keyboardShortcutsEnabled = updates.keyboard_shortcuts_enabled;
  if (updates.preferences) mapped.preferences = updates.preferences;

  await drizzle
    .insert(userPreferences)
    .values({ userId, ...mapped })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: mapped
    });
}

export async function trackOnboardingStep(
  userId: string,
  stepId: string,
  metadata?: Record<string, any>
): Promise<{ completed: boolean }> {
  await drizzle
    .insert(onboardingProgress)
    .values({
      userId,
      stepId,
      completed: true,
      completedAt: new Date(),
      metadata: metadata || {},
    })
    .onConflictDoUpdate({
      target: [onboardingProgress.userId, onboardingProgress.stepId],
      set: {
        completed: true,
        completedAt: new Date(),
        metadata: metadata || {},
      }
    });

  return { completed: true };
}

export async function getOnboardingProgress(userId: string): Promise<Record<string, boolean>> {
  try {
    const data = await drizzle
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, userId));

    return data.reduce((acc, row) => {
      acc[row.stepId] = row.completed || false;
      return acc;
    }, {} as Record<string, boolean>);
  } catch (error) {
    return {};
  }
}
