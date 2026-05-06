import { supabase } from './supabase';

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
  const { data, error } = await supabase
    .from('wireline_user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // Return defaults for new users
    return {
      user_id: userId,
      tour_completed: false,
      onboarding_completed: false,
      help_enabled: true,
      keyboard_shortcuts_enabled: true,
      preferences: {},
    };
  }

  return data;
}

export async function updateUserPreferences(
  userId: string,
  updates: Partial<UserPreferences>
): Promise<void> {
  const { error } = await supabase
    .from('wireline_user_preferences')
    .upsert({
      user_id: userId,
      ...updates,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

export async function trackOnboardingStep(
  userId: string,
  stepId: string,
  metadata?: Record<string, any>
): Promise<{ completed: boolean }> {
  const { error } = await supabase
    .from('wireline_onboarding_progress')
    .upsert({
      user_id: userId,
      step_id: stepId,
      completed: true,
      completed_at: new Date().toISOString(),
      metadata: metadata || {},
    });

  if (error) throw error;
  return { completed: true };
}

export async function getOnboardingProgress(userId: string): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('wireline_onboarding_progress')
    .select('step_id, completed')
    .eq('user_id', userId);

  if (error) return {};

  return (data || []).reduce((acc, row) => {
    acc[row.step_id] = row.completed;
    return acc;
  }, {} as Record<string, boolean>);
}
