@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

html {
  min-height: 100%;
  background: #060807;
}

body {
  min-height: 100%;
  margin: 0;
  background:
    radial-gradient(circle at 20% 0%, rgba(30, 215, 96, 0.2), transparent 28rem),
    linear-gradient(135deg, #060807 0%, #0d1110 48%, #111a15 100%);
  color: #f5f7f4;
}

button,
input,
textarea {
  font: inherit;
}

::selection {
  background: rgba(30, 215, 96, 0.32);
}
