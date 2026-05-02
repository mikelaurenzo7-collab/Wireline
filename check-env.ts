import * as dotenv from 'dotenv';
dotenv.config();

console.log("VITE_SUPABASE_URL:", process.env.VITE_SUPABASE_URL ? "SET" : "NOT SET");
console.log("VITE_SUPABASE_ANON_KEY:", process.env.VITE_SUPABASE_ANON_KEY ? "SET" : "NOT SET");
console.log("SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "NOT SET");

import { createClient } from '@supabase/supabase-js';

async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
     console.log("Missing Supabase credentials");
     return;
  }
  
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const db = createClient(supabaseUrl, supabaseKey);

  console.log("Attempting to query wireline_users or auth.users...");
  // Try to create the user account
  const { data, error } = await db.auth.admin.createUser({
    email: 'mikelaurenzo7@gmail.com',
    password: 'Chet1212!',
    email_confirm: true
  });

  if (error) {
    console.error("Create User Error:", error.message);
    if (error.message.includes('already registered')) {
         console.log("User already exists. Updating password...");
         // We can't easily update password without their ID, let's find the user first
         // Wait, auth.admin.updateUserById is available
         // Alternatively, we can let them login
    }
  } else {
    console.log("Created user:", data.user?.id);
  }
}

main();
