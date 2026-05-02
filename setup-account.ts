import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function setupFounder() {
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in environment");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const email = 'mikelaurenzo7@gmail.com';
  const password = 'Chet1212!';

  console.log(`Connecting to: ${supabaseUrl}`);

  // 1. Check if user exists in auth
  const { data: { users }, error: listError } = await (supabase.auth.admin.listUsers() as any);
  
  if (listError) {
    console.error("Error listing users:", listError.message);
    return;
  }

  const existingUser = (users as any[]).find(u => u.email === email);

  if (existingUser) {
    console.log("User exists. Updating password and ensuring founder status...");
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      existingUser.id,
      { 
        password: password,
        email_confirm: true 
      }
    );
    if (updateError) console.error("Update error:", updateError.message);
    else console.log("Password updated and email confirmed.");

    // Ensure settings are active and set to founder level
    const { error: settingsError } = await supabase.from('wireline_settings').upsert({
       id: existingUser.id,
       user_id: existingUser.id,
       subscription_status: 'active',
       max_agents: 100
    }, { onConflict: 'user_id' });
    if (settingsError) console.error("Settings update error:", settingsError.message);
    else console.log("Founder settings initialized (MAX_AGENTS=100).");
  } else {
    console.log("Creating new founder account...");
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (createError) {
      console.error("Create error:", createError.message);
    } else if (newUser.user) {
       console.log("Account created successfully:", newUser.user.id);
       await supabase.from('wireline_settings').insert({
          id: newUser.user.id,
          user_id: newUser.user.id,
          subscription_status: 'active'
       });
    }
  }
}

setupFounder();
