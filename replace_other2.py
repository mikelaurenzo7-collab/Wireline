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

replace_in_file('/app/src/components/InsightsView.tsx', 'These limits keep Vapi tool fan-out', 'These limits keep voice tool fan-out')
