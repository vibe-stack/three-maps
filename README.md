# Three Maps

A map editor for rapid game blockout, built with Three.js and React.

## Features

### Core Functionality
- **Reactive Geometry System**: Built on Zustand stores with reactive data structures
- **Dual View Modes**: Object Mode and Edit Mode for different interaction paradigms
- **Component Selection**: Vertex, Edge, and Face selection in Edit Mode
- **Scene Hierarchy**: Nested objects with parent-child relationships
- **Real-time Updates**: All changes are immediately reflected across the UI

### Quick Brush
Rapidly paint and place geometry for fast level blockout iteration.

### Floor Plan Editor
2D top-down editor for sketching room layouts and building footprints before working in 3D.

### T3D File Format
- **Custom Format**: Proprietary `.t3d` format for saving/loading scenes
- **Full Data Preservation**: Complete scene state including meshes, materials, hierarchy, and viewport
- **Browser-based**: Entirely client-side export/import using ZIP compression
- **Version Control**: Built-in version compatibility system
- **ID Stability**: Preserves all object IDs across export/import cycles

### Current Implementation
- Multiple mesh creation and management
- Material system with PBR properties
- Transform operations (position, rotation, scale)
- Selection state management
- Viewport camera controls

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **3D Rendering**: Three.js, React Three Fiber, Drei
- **State Management**: Zustand with Immer middleware
- **File Handling**: JSZip for T3D format
- **Styling**: Tailwind CSS
- **Build**: Turbopack

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run development server**:
   ```bash
   npm run dev
   ```

3. **Open in browser**: Navigate to `http://localhost:3000`

## Usage

### Basic Workflow

1. **Create Demo Content**: Click "Create Demo Scene" to populate the scene
2. **Switch Modes**: Use Tab key to toggle between Object and Edit modes
3. **Select Elements**: Click objects/vertices/edges/faces based on current mode
4. **Export Scene**: Click "Export as .t3d" to save your work
5. **Import Scene**: Click "Import .t3d" to load a saved scene

### Keyboard Shortcuts

- **Tab**: Toggle between Object Mode and Edit Mode
- **1**: Switch to Vertex selection (Edit Mode)
- **2**: Switch to Edge selection (Edit Mode)
- **3**: Switch to Face selection (Edit Mode)
- **Alt+A** / **Esc**: Clear all selections

## T3D File Format

The T3D format is a ZIP archive containing:

- `scene.json`: Complete scene data in JSON format
- `assets/`: Folder for textures and other assets (future)

See [T3D_FORMAT.md](./T3D_FORMAT.md) for detailed specification.

## Project Structure

```
src/
├── app/                    # Next.js app directory
├── components/             # React components
├── stores/                 # Zustand stores
│   ├── geometryStore.ts   # Meshes and materials
│   ├── sceneStore.ts      # Scene hierarchy
│   ├── selectionStore.ts  # Selection state
│   └── viewportStore.ts   # Camera and viewport
├── types/                  # TypeScript definitions
│   ├── geometry.ts        # Core 3D types
│   └── t3d.ts            # T3D format types
└── utils/                  # Utilities
    ├── geometry.ts        # Math and geometry helpers
    ├── t3dExporter.ts     # T3D export functionality
    └── t3dImporter.ts     # T3D import functionality
```

## License

MIT Licensed. Go make it yours!