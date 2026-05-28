import re

def replace_in_file(file_path, old, new):
    try:
        with open(file_path, 'r') as f:
            content = f.read()
        content = content.replace(old, new)
        with open(file_path, 'w') as f:
            f.write(content)
    except Exception as e:
        print(f"Error {file_path}: {e}")

replace_in_file('/app/src/components/Security.tsx', 'Every inbound webhook (Vapi, Stripe, Twilio, ElevenLabs)', 'Every inbound webhook (Voice Bridge, Stripe, Twilio, ElevenLabs)')
replace_in_file('/app/src/components/InsightsView.tsx', 'keeps Vapi tool fan-out', 'keeps tool fan-out')
replace_in_file('/app/src/data/wireline-knowledge.ts', 'Live calls run through Vapi', 'Live calls run through our voice bridge')
replace_in_file('/app/src/pages/Showcase.tsx', 'before bridging to Vapi (SIP)', 'before bridging to our voice engine (SIP)')

# Just in case, let's do a case-insensitive replacement for Vapi in some files if they are visible?
# No, we replaced the known ones.
