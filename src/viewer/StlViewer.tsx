import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { useStore } from '@tanstack/react-store'
import { projectStore } from '@/store/project-store'

function parseStl(bytes: Uint8Array): THREE.BufferGeometry {
  const loader = new STLLoader()
  // STLLoader.parse can take an ArrayBuffer.
  const ab =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? (bytes.buffer as ArrayBuffer)
      : (bytes.slice().buffer as ArrayBuffer)
  return loader.parse(ab)
}

type Bounds = {
  size: THREE.Vector3
  center: THREE.Vector3
  radius: number
}

function computeBounds(geometry: THREE.BufferGeometry): Bounds {
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const box = geometry.boundingBox ?? new THREE.Box3()
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const radius = geometry.boundingSphere?.radius ?? Math.max(size.x, size.y, size.z) / 2
  return { size, center, radius }
}

function FitCamera({ bounds }: { bounds: Bounds | null }) {
  const { camera } = useThree()
  const lastRadius = useRef<number | null>(null)
  useEffect(() => {
    if (!bounds) return
    if (lastRadius.current === bounds.radius) return
    lastRadius.current = bounds.radius
    const r = Math.max(bounds.radius, 1)
    const distance = r * 2.6
    camera.position.set(distance, distance * 0.85, distance)
    camera.lookAt(0, 0, 0)
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = Math.max(r / 100, 0.01)
      camera.far = r * 100
      camera.updateProjectionMatrix()
    }
  }, [bounds, camera])
  return null
}

function StlMesh({
  geometry,
  bounds,
}: {
  geometry: THREE.BufferGeometry
  bounds: Bounds
}) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#4fb8b2',
        metalness: 0.05,
        roughness: 0.45,
        flatShading: true,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => geometry.dispose(), [geometry])

  const offset = useMemo(
    () =>
      new THREE.Vector3(-bounds.center.x, -bounds.center.y, -bounds.center.z),
    [bounds.center.x, bounds.center.y, bounds.center.z],
  )

  return (
    <group position={offset}>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
    </group>
  )
}

function Scene({ stl }: { stl: Uint8Array | null }) {
  const { geometry, bounds } = useMemo(() => {
    if (!stl) return { geometry: null, bounds: null }
    try {
      const g = parseStl(stl)
      g.computeVertexNormals()
      const b = computeBounds(g)
      return { geometry: g, bounds: b }
    } catch (e) {
      console.error('[StlViewer] parse error', e)
      return { geometry: null, bounds: null }
    }
  }, [stl])

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 18, 14]} intensity={1.05} />
      <directionalLight position={[-12, -6, -10]} intensity={0.35} />
      <Grid
        args={[200, 200]}
        cellSize={5}
        cellThickness={0.6}
        sectionSize={20}
        sectionThickness={1.2}
        fadeDistance={200}
        infiniteGrid
      />
      <axesHelper args={[Math.max(bounds?.radius ?? 10, 10) * 0.5]} />
      {geometry && bounds ? (
        <StlMesh geometry={geometry} bounds={bounds} />
      ) : null}
      <FitCamera bounds={bounds} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </>
  )
}

export function StlViewer({ className }: { className?: string }) {
  const stl = useStore(projectStore, (s) => s.render.stl)
  return (
    <div className={className}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [80, 60, 80], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <Scene stl={stl} />
        </Suspense>
      </Canvas>
    </div>
  )
}
