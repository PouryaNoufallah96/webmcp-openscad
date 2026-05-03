import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Billboard, Grid, OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { useSelector } from '@tanstack/react-store'
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

const DIM_COLOR = '#f7e608'

function formatMm(value: number): string {
  const v = Math.abs(value)
  const decimals = v >= 100 ? 1 : v >= 10 ? 2 : 3
  return value.toFixed(decimals)
}

function DimensionRod({
  from,
  to,
  radius,
}: {
  from: THREE.Vector3
  to: THREE.Vector3
  radius: number
}) {
  const { position, quaternion, length } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(to, from)
    const len = dir.length()
    if (len < 1e-9) {
      return {
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        length: 0,
      }
    }
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5)
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    )
    return { position: mid, quaternion: quat, length: len }
  }, [from, to])

  if (length < 1e-9) return null

  return (
    <mesh position={position} quaternion={quaternion} renderOrder={2}>
      <cylinderGeometry args={[radius, radius, length, 20]} />
      <meshBasicMaterial
        color={DIM_COLOR}
        transparent
        opacity={0.5}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

function MmLabel({
  children,
  position,
  fontSize,
}: {
  children: string
  position: THREE.Vector3
  fontSize: number
}) {
  return (
    <Billboard position={position} follow renderOrder={3}>
      <Text
        fontSize={fontSize}
        color={DIM_COLOR}
        anchorX="center"
        anchorY="middle"
        outlineWidth={fontSize * 0.08}
        outlineColor="#000"
        outlineOpacity={0.85}
        material-toneMapped={false}
        material-depthTest={false}
        material-depthWrite={false}
        renderOrder={3}
      >
        {children}
      </Text>
    </Billboard>
  )
}

/** Three mutually perpendicular rods + labels hugging the bottom-front-right corner (Y-up). */
function IntegratedExtentDimensions({ size }: { size: THREE.Vector3 }) {
  const { rods, labels, fontSize } = useMemo(() => {
    const hx = size.x / 2
    const hy = size.y / 2
    const hz = size.z / 2
    const span = Math.max(size.x, size.y, size.z, 1)
    // Hug the model: just enough offset to avoid z-fighting with the surface.
    const pad = Math.max(span * 0.006, 0.15)
    const rodR = Math.min(Math.max(span * 0.0055, 0.09), span * 0.0175)
    const labelGap = Math.max(span * 0.04, 0.6)
    const fs = Math.max(span * 0.06, 1.2)

    const yBottom = -hy - pad
    const zBack = -hz - pad
    const xRight = hx + pad

    // X rod: along the bottom-back edge of the bounding box.
    const xFrom = new THREE.Vector3(-hx, yBottom, zBack)
    const xTo = new THREE.Vector3(hx, yBottom, zBack)

    // Z rod: along the bottom-right edge (depth) — anchored at the back corner.
    const zFrom = new THREE.Vector3(xRight, yBottom, -hz)
    const zTo = new THREE.Vector3(xRight, yBottom, hz)

    // Y rod: up the back-right corner (height).
    const yFrom = new THREE.Vector3(xRight, -hy, zBack)
    const yTo = new THREE.Vector3(xRight, hy, zBack)

    // Place each label just outside the midpoint of its rod so it sits right on the piece.
    const xLabelPos = new THREE.Vector3(0, yBottom - labelGap, zBack)
    const zLabelPos = new THREE.Vector3(xRight, yBottom - labelGap, 0)
    const yLabelPos = new THREE.Vector3(xRight + labelGap, 0, zBack)

    return {
      rods: { xFrom, xTo, zFrom, zTo, yFrom, yTo, rodR },
      labels: { x: xLabelPos, z: zLabelPos, y: yLabelPos },
      fontSize: fs,
    }
  }, [size.x, size.y, size.z])

  return (
    <group renderOrder={2}>
      <DimensionRod from={rods.xFrom} to={rods.xTo} radius={rods.rodR} />
      <DimensionRod from={rods.zFrom} to={rods.zTo} radius={rods.rodR} />
      <DimensionRod from={rods.yFrom} to={rods.yTo} radius={rods.rodR} />
      <MmLabel position={labels.x} fontSize={fontSize}>
        {`${formatMm(size.x)} mm`}
      </MmLabel>
      <MmLabel position={labels.z} fontSize={fontSize}>
        {`${formatMm(size.z)} mm`}
      </MmLabel>
      <MmLabel position={labels.y} fontSize={fontSize}>
        {`${formatMm(size.y)} mm`}
      </MmLabel>
    </group>
  )
}

function StlMesh({
  geometry,
  bounds,
  showExtents,
}: {
  geometry: THREE.BufferGeometry
  bounds: Bounds
  showExtents: boolean
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
      {showExtents ? <IntegratedExtentDimensions size={bounds.size} /> : null}
    </group>
  )
}

function Scene({
  geometry,
  bounds,
  showExtents,
}: {
  geometry: THREE.BufferGeometry | null
  bounds: Bounds | null
  showExtents: boolean
}) {
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
        <StlMesh geometry={geometry} bounds={bounds} showExtents={showExtents} />
      ) : null}
      <FitCamera bounds={bounds} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </>
  )
}

export function StlViewer({
  className,
  showExtents = false,
}: {
  className?: string
  showExtents?: boolean
}) {
  const stl = useSelector(projectStore, (s) => s.render.stl)
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
    <div className={['relative', className].filter(Boolean).join(' ')}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [80, 60, 80], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <Scene geometry={geometry} bounds={bounds} showExtents={showExtents} />
        </Suspense>
      </Canvas>
      {bounds && showExtents ? (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/55 px-2.5 py-1.5 font-mono text-[11px] leading-tight text-white/90 tabular-nums shadow-sm backdrop-blur-[2px]">
          <span className="text-white/60">Extents (mm)</span>
          <div className="mt-0.5 text-white/95">
            X {formatMm(bounds.size.x)} · Y {formatMm(bounds.size.y)} · Z {formatMm(bounds.size.z)}
          </div>
        </div>
      ) : null}
    </div>
  )
}
