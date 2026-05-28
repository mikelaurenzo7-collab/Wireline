import re

with open('/app/src/index.css', 'r') as f:
    css = f.read()

# Replace rgba(79, 30, 123, X) with rgba(0, 0, 0, X)
css = re.sub(r'rgba\(\s*79\s*,\s*30\s*,\s*123\s*,\s*([0-9.]+)\s*\)', r'rgba(0, 0, 0, \1)', css)

# There are some rgba(255, 255, 255, X) but those are fine for stark black/white contrast on dark mode or overlays.

# Remove `.marketing-btn-primary:hover { background: #6a25a3; }` and adjust to black variants
css = css.replace('#6a25a3', '#1A1A1A')

# Remove `.text-aurora { color: #4F1E7B; }`
css = css.replace('color: #4F1E7B;', 'color: #0A0A0A;')

# Let's fix .badge-aurora and .chip-brand
css = css.replace('background: rgba(79, 30, 123, 0.10);', 'background: rgba(0, 0, 0, 0.05);')
css = css.replace('border: 1px solid rgba(79, 30, 123, 0.30);', 'border: 1px solid rgba(0, 0, 0, 0.15);')

# Let's make sure #4F1E7B and #3B154C are gone entirely
css = css.replace('#4F1E7B', '#0A0A0A')
css = css.replace('#3B154C', '#000000')

with open('/app/src/index.css', 'w') as f:
    f.write(css)

