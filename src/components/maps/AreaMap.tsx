import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { Crosshair, MapPinOff, Minus, Plus, Scan } from 'lucide-react'
import type * as Leaflet from 'leaflet'
import { cn } from '#/lib/utils'

export type MapPoint = { latitude: number; longitude: number }
export type MapFix = MapPoint & { accuracy: number }
export type AreaTone = 'brand' | 'neutral' | 'success' | 'warning'
export type PositionTone = 'live' | AreaTone

export type AreaMapHandle = {
  /** Pan and zoom to a place, e.g. a search result. Interactive maps only. */
  flyTo: (p: MapPoint, zoom?: number) => void
  /** Re-frame the view per `fitTo`. */
  fitArea: () => void
}

export type AreaMapProps = {
  /** Department centre. `null` shows the default view with no area (interactive maps only). */
  centre: MapPoint | null
  radiusM: number
  /** Area circle colour. Default `brand`. */
  tone?: AreaTone
  /** One position with its accuracy halo (live sample, test, or staff check-in). */
  position?: MapFix | null
  /** `live` = brand dot that pulses. Default `live`. */
  positionTone?: PositionTone
  /** Numbered readings (admin set-up). */
  readings?: MapFix[]
  /**
   * Admin: draggable pin, click/tap to set the centre, zoom/pan, map controls.
   * Default false: fixed view, no drag/zoom/pan/keyboard, nothing clickable except attribution.
   */
  interactive?: boolean
  onCentreChange?: (p: MapPoint) => void
  /**
   * `area` (default) frames the circle only. `area+position` also frames the position and readings,
   * but on non-interactive maps only while the position is within `privacyFrameM` of the centre,
   * so tile requests never reveal where someone is when they're away from the department. A
   * position outside the frame gets an edge arrow instead of a pan.
   */
  fitTo?: 'area' | 'area+position'
  /** Non-interactive maps: furthest a position may be from the centre and still be framed. Default max(3 × radius, 300 m). */
  privacyFrameM?: number
  /** Show the distance beside the edge arrow. Default true; off when the screen already says how far. */
  arrowLabel?: boolean
  /** Show the centre pin. Default true; staff maps hide it once their own dot is on the map. */
  showPin?: boolean
  /** Keep the edge arrow this far below the top edge, e.g. clear of overlaid chips. Default 28px. */
  arrowInsetTop?: number
  /** CSS height. Default 320px (420px from lg) when interactive, 220px otherwise. */
  height?: number | string
  className?: string
  /** Accessible description of what the map shows. */
  label?: string
  /** Shown instead of the map if Leaflet or the tiles can't load. */
  fallback?: ReactNode
  onUnavailable?: (reason: string) => void
  ref?: Ref<AreaMapHandle>
}

/** Whipps Cross University Hospital A&E, London E11 1NR: the pilot site and the default view. */
export const DEFAULT_VIEW = { latitude: 51.5781, longitude: 0.004, zoom: 17 }

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
const MAX_ZOOM = 19

// Class names live here as whole strings so Tailwind generates them; Leaflet applies them to SVG paths.
const AREA_CLASS: Record<AreaTone, string> = {
  brand: 'stroke-primary-500 fill-primary-500',
  neutral: 'stroke-ink fill-neutral-500',
  success: 'stroke-success-600 fill-success-500',
  warning: 'stroke-warning-600 fill-warning-500',
}
const HALO_CLASS: Record<PositionTone, string> = {
  live: 'stroke-primary-500 fill-primary-500',
  brand: 'stroke-primary-500 fill-primary-500',
  neutral: 'stroke-ink fill-ink',
  success: 'stroke-success-600 fill-success-500',
  warning: 'stroke-warning-600 fill-warning-500',
}
const DOT_CLASS: Record<PositionTone, string> = {
  live: 'bg-primary-500',
  brand: 'bg-accent-accessible',
  neutral: 'bg-ink',
  success: 'bg-success-accessible',
  warning: 'bg-warning-600',
}
const ARROW_CLASS: Record<PositionTone, string> = {
  live: 'text-primary-500',
  brand: 'text-accent-accessible',
  neutral: 'text-ink',
  success: 'text-success-accessible',
  warning: 'text-warning-600',
}
const PIN_FILL: Record<AreaTone, string> = {
  brand: 'bg-accent-accessible',
  neutral: 'bg-ink',
  success: 'bg-success-accessible',
  warning: 'bg-warning-700',
}

// Leaflet's default marker images don't resolve under Vite, so every marker is a divIcon.
const pinHtml = (tone: AreaTone) => `
  <span class="pointer-events-none absolute left-1/2 top-[38px] h-1.5 w-4 -translate-x-1/2 rounded-full bg-black/25 blur-[2px]"></span>
  <span class="pointer-events-none absolute left-1/2 top-1 flex size-8 -translate-x-1/2 rotate-45 items-center justify-center rounded-full rounded-br-none border-[3px] border-white ${PIN_FILL[tone]} shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
    <span class="size-2.5 -rotate-45 rounded-full bg-white"></span>
  </span>`

/** East of `p` by `m` metres (drawing only). */
function eastOf(p: MapPoint, m: number): [number, number] {
  return [p.latitude, p.longitude + m / (111_320 * Math.cos((p.latitude * Math.PI) / 180))]
}

function nudge(p: MapPoint, eastM: number, northM: number): MapPoint {
  return {
    latitude: p.latitude + northM / 110_574,
    longitude: p.longitude + eastM / (111_320 * Math.cos((p.latitude * Math.PI) / 180)),
  }
}

type Layers = {
  map: Leaflet.Map
  area: Leaflet.Circle
  spoke: Leaflet.Polyline
  label: Leaflet.Marker
  pin: Leaflet.Marker
  extras: Leaflet.LayerGroup
}

type Arrow = { x: number; y: number; angle: number; metres: number }

/**
 * OpenStreetMap view of the department area. Leaflet and its CSS are imported inside an effect,
 * so server rendering never touches `window` and pages without a map never download it.
 */
export function AreaMap({
  centre,
  radiusM,
  tone = 'brand',
  position = null,
  positionTone = 'live',
  readings = [],
  interactive = false,
  onCentreChange,
  fitTo = 'area',
  privacyFrameM,
  arrowLabel = true,
  showPin = true,
  arrowInsetTop = 28,
  height,
  className,
  label,
  fallback,
  onUnavailable,
  ref,
}: AreaMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const layers = useRef<Layers | null>(null)
  const L = useRef<typeof Leaflet | null>(null)
  const [ready, setReady] = useState(false)
  const [tilesShown, setTilesShown] = useState(false)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [arrow, setArrow] = useState<Arrow | null>(null)
  const pending = useRef<(() => void) | null>(null)
  // Latest props for Leaflet callbacks, which are bound once.
  const latest = useRef({ centre, radiusM, position, readings, fitTo, privacyFrameM, interactive, onCentreChange, onUnavailable, arrowInsetTop })
  latest.current = { centre, radiusM, position, readings, fitTo, privacyFrameM, interactive, onCentreChange, onUnavailable, arrowInsetTop }

  const fail = (reason: string) => {
    setUnavailable((cur) => {
      if (cur === null) latest.current.onUnavailable?.(reason)
      return cur ?? reason
    })
  }

  const fitAll = (animate = true) => {
    const ls = layers.current
    const Lf = L.current
    if (!ls || !Lf) return
    const { centre: c, radiusM: r, readings: rs, position: pos, fitTo: ft, privacyFrameM: cap, interactive: inter } = latest.current
    if (!c) {
      ls.map.setView([DEFAULT_VIEW.latitude, DEFAULT_VIEW.longitude], DEFAULT_VIEW.zoom, { animate })
      return
    }
    const here = Lf.latLng(c.latitude, c.longitude)
    const bounds = here.toBounds(r * 2)
    if (ft === 'area+position') {
      const limit = inter ? Infinity : (cap ?? Math.max(3 * r, 300))
      for (const f of [...rs, ...(pos ? [pos] : [])]) {
        const p = Lf.latLng(f.latitude, f.longitude)
        if (here.distanceTo(p) <= limit) bounds.extend(p.toBounds(Math.min(f.accuracy, limit) * 2))
      }
    }
    ls.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 18, animate })
  }

  useImperativeHandle(ref, () => ({
    flyTo: (p, zoom = 18) => {
      const run = () => layers.current?.map.flyTo([p.latitude, p.longitude], zoom, { duration: 0.8 })
      if (layers.current) run()
      else pending.current = run
    },
    fitArea: () => {
      if (layers.current) fitAll()
      else pending.current = () => fitAll(false)
    },
  }))

  // Edge arrow toward a position that's outside the current view.
  const updateArrow = () => {
    const ls = layers.current
    const Lf = L.current
    const pos = latest.current.position
    if (!ls || !Lf || !pos) return setArrow(null)
    const p = Lf.latLng(pos.latitude, pos.longitude)
    const size = ls.map.getSize()
    const pt = ls.map.latLngToContainerPoint(p)
    // Keep clear of the edges and the attribution strip along the bottom.
    const inset = { x: 28, top: latest.current.arrowInsetTop, bottom: 40 }
    if (pt.x >= inset.x && pt.x <= size.x - inset.x && pt.y >= inset.top && pt.y <= size.y - inset.bottom) return setArrow(null)
    const cx = size.x / 2
    const cy = (inset.top + size.y - inset.bottom) / 2
    const dx = pt.x - cx
    const dy = pt.y - cy
    const s = Math.min(Math.abs((cx - inset.x) / (dx || 1e-9)), Math.abs((dy > 0 ? size.y - inset.bottom - cy : cy - inset.top) / (dy || 1e-9)))
    setArrow({
      x: cx + dx * s,
      y: cy + dy * s,
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      metres: (latest.current.centre ? Lf.latLng(latest.current.centre.latitude, latest.current.centre.longitude) : ls.map.getCenter()).distanceTo(p),
    })
  }

  // Create the map once, client-side only.
  useEffect(() => {
    let cancelled = false
    let failTimer: ReturnType<typeof setTimeout> | undefined
    let resize: ResizeObserver | undefined
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      fail("You're offline, so the map can't load.")
      return
    }
    void (async () => {
      let Lf: typeof Leaflet
      try {
        const [mod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
        Lf = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet
      } catch {
        if (!cancelled) fail("The map couldn't load.")
        return
      }
      if (cancelled || !el.current) return
      L.current = Lf
      const inter = latest.current.interactive
      const c = latest.current.centre
      const map = Lf.map(el.current, {
        center: c ? [c.latitude, c.longitude] : [DEFAULT_VIEW.latitude, DEFAULT_VIEW.longitude],
        zoom: DEFAULT_VIEW.zoom,
        maxZoom: MAX_ZOOM,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: inter,
        touchZoom: inter,
        doubleClickZoom: inter,
        boxZoom: inter,
        keyboard: inter,
        zoomSnap: inter ? 1 : 0.25,
      })
      Lf.control.attribution({ prefix: '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>' }).addTo(map)

      let loaded = 0
      let failed = 0
      const tiles = Lf.tileLayer(TILE_URL, { maxZoom: MAX_ZOOM, attribution: ATTRIBUTION })
      tiles.on('tileload', () => {
        loaded++
        if (loaded === 1) setTilesShown(true)
      })
      tiles.on('tileerror', () => {
        failed++
        if (loaded === 0 && failed >= 4) fail("Map tiles couldn't load from OpenStreetMap.")
      })
      tiles.addTo(map)
      failTimer = setTimeout(() => {
        if (loaded === 0) fail('Map tiles are taking too long to load.')
      }, 12_000)

      if (inter) {
        // Scroll-wheel zoom only once someone is using the map, so page scrolling isn't hijacked.
        map.on('focus click', () => map.scrollWheelZoom.enable())
        map.on('blur mouseout', () => map.scrollWheelZoom.disable())
      }
      map.on('move zoom resize', updateArrow)

      const at = c ?? { latitude: DEFAULT_VIEW.latitude, longitude: DEFAULT_VIEW.longitude }
      const r = latest.current.radiusM
      const area = Lf.circle([at.latitude, at.longitude], { radius: r, className: AREA_CLASS.brand, weight: 2.5, fillOpacity: 0.14, interactive: false })
      const spoke = Lf.polyline([[at.latitude, at.longitude], eastOf(at, r)], {
        className: 'stroke-accent-accessible',
        weight: 1.5,
        dashArray: '4 4',
        interactive: false,
      })
      const label = Lf.marker(eastOf(at, r / 2), { interactive: false, keyboard: false, icon: Lf.divIcon({ className: '', iconSize: [0, 0], html: '' }) })
      const pin = Lf.marker([at.latitude, at.longitude], {
        draggable: inter,
        autoPan: inter,
        interactive: inter,
        keyboard: inter,
        title: inter ? 'Department centre. Drag, or use the arrow keys, to move it.' : '',
        alt: 'Department centre',
        zIndexOffset: 1000,
        icon: Lf.divIcon({ className: '', iconSize: [44, 48], iconAnchor: [22, 41], html: '' }),
      })
      const extras = Lf.layerGroup().addTo(map)

      if (inter) {
        const moveArea = (p: Leaflet.LatLng) => {
          const pt = { latitude: p.lat, longitude: p.lng }
          const rr = latest.current.radiusM
          area.setLatLng(p)
          spoke.setLatLngs([[p.lat, p.lng], eastOf(pt, rr)])
          label.setLatLng(eastOf(pt, rr / 2))
        }
        pin.on('drag', () => moveArea(pin.getLatLng()))
        pin.on('dragend', () => {
          const p = pin.getLatLng()
          latest.current.onCentreChange?.({ latitude: p.lat, longitude: p.lng })
        })
        map.on('click', (e: Leaflet.LeafletMouseEvent) => latest.current.onCentreChange?.({ latitude: e.latlng.lat, longitude: e.latlng.lng }))
        pin.on('add', () => {
          pin.getElement()?.addEventListener('keydown', (ev) => {
            const step = ev.shiftKey ? 10 : 2
            const d = ({ ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] } as Record<string, number[]>)[ev.key]
            if (!d) return
            ev.preventDefault()
            ev.stopPropagation()
            const cur = pin.getLatLng()
            latest.current.onCentreChange?.(nudge({ latitude: cur.lat, longitude: cur.lng }, d[0], d[1]))
          })
        })
      }

      resize = new ResizeObserver(() => map.invalidateSize())
      resize.observe(el.current)

      layers.current = { map, area, spoke, label, pin, extras }
      setReady(true)
      if (pending.current) {
        pending.current()
        pending.current = null
      } else if (c) fitAll(false)
    })()
    return () => {
      cancelled = true
      clearTimeout(failTimer)
      resize?.disconnect()
      layers.current?.map.remove()
      layers.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Area circle, pin and (interactive) radius spoke/label follow the props.
  useEffect(() => {
    const ls = layers.current
    const Lf = L.current
    if (!ls || !Lf) return
    const show = !!centre
    const wanted = interactive ? [ls.area, ls.spoke, ls.label, ls.pin] : showPin ? [ls.area, ls.pin] : [ls.area]
    for (const layer of [ls.area, ls.spoke, ls.label, ls.pin]) {
      const on = show && wanted.includes(layer)
      if (on && !ls.map.hasLayer(layer)) layer.addTo(ls.map)
      if (!on && ls.map.hasLayer(layer)) layer.remove()
    }
    if (!centre) return
    const p = Lf.latLng(centre.latitude, centre.longitude)
    ls.pin.setLatLng(p)
    ls.area.setLatLng(p).setRadius(radiusM)
    ls.spoke.setLatLngs([p, eastOf(centre, radiusM)])
    ls.label.setLatLng(eastOf(centre, radiusM / 2))
    ls.label.setIcon(
      Lf.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<span class="pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-accent-accessible shadow-card">${Math.round(radiusM)} m</span>`,
      }),
    )
  }, [ready, centre?.latitude, centre?.longitude, radiusM, interactive, showPin]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tone changes restyle the circle and pin.
  useEffect(() => {
    const ls = layers.current
    const Lf = L.current
    if (!ls || !Lf) return
    const path = (ls.area as unknown as { _path?: SVGPathElement })._path
    if (path) path.setAttribute('class', AREA_CLASS[tone])
    ls.area.options.className = AREA_CLASS[tone]
    ls.pin.setIcon(
      Lf.divIcon({
        className: interactive ? 'cursor-grab active:cursor-grabbing' : '',
        iconSize: [44, 48],
        iconAnchor: [22, 41],
        html: pinHtml(tone),
      }),
    )
  }, [ready, tone, interactive])

  // On a fixed map, frame again when the area (or the framed position) changes.
  useEffect(() => {
    if (!ready || interactive) return
    fitAll(false)
    updateArrow()
  }, [ready, interactive, centre?.latitude, centre?.longitude, radiusM, fitTo, position?.latitude, position?.longitude]) // eslint-disable-line react-hooks/exhaustive-deps

  // Interactive: if the radius grows past the view, refit once the slider settles.
  useEffect(() => {
    const ls = layers.current
    if (!ls || !centre || !interactive) return
    const t = setTimeout(() => {
      if (!ls.map.getBounds().contains(ls.area.getBounds())) fitAll()
    }, 450)
    return () => clearTimeout(t)
  }, [radiusM]) // eslint-disable-line react-hooks/exhaustive-deps

  // Readings and the position.
  useEffect(() => {
    const ls = layers.current
    const Lf = L.current
    if (!ls || !Lf) return
    ls.extras.clearLayers()
    const halo = (f: MapFix, cls: string) =>
      Lf.circle([f.latitude, f.longitude], { radius: f.accuracy, className: cls, weight: 1.5, dashArray: '5 5', fillOpacity: 0.08, interactive: false })
    readings.forEach((r, i) => {
      halo(r, 'stroke-ink fill-ink').addTo(ls.extras)
      Lf.marker([r.latitude, r.longitude], {
        interactive: false,
        keyboard: false,
        icon: Lf.divIcon({
          className: '',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          html: `<span class="flex size-6 items-center justify-center rounded-full border-2 border-white bg-ink text-[11px] font-bold text-white tabular-nums shadow-card">${i + 1}</span>`,
        }),
      }).addTo(ls.extras)
    })
    if (position) {
      halo(position, HALO_CLASS[positionTone]).addTo(ls.extras)
      const pulse = positionTone === 'live'
      Lf.marker([position.latitude, position.longitude], {
        interactive: false,
        keyboard: false,
        zIndexOffset: 1500,
        icon: Lf.divIcon({
          className: '',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          html: `<span class="relative flex size-[18px]">${pulse ? `<span class="absolute inset-0 animate-ping rounded-full ${DOT_CLASS[positionTone]} opacity-60 motion-reduce:animate-none"></span>` : ''}<span class="relative size-[18px] rounded-full border-[3px] border-white ${DOT_CLASS[positionTone]} shadow-card"></span></span>`,
        }),
      }).addTo(ls.extras)
    }
    updateArrow()
  }, [ready, readings, position?.latitude, position?.longitude, position?.accuracy, positionTone]) // eslint-disable-line react-hooks/exhaustive-deps

  // Interactive: frame new readings and positions as they arrive.
  const readingCount = readings.length
  useEffect(() => {
    if (interactive && (readingCount || position) && fitTo === 'area+position') fitAll()
  }, [readingCount, !!position, positionTone]) // eslint-disable-line react-hooks/exhaustive-deps

  const map = () => layers.current?.map
  const placeHere = () => {
    const m = map()
    if (!m) return
    const c = m.getCenter()
    onCentreChange?.({ latitude: c.lat, longitude: c.lng })
  }

  const style = height !== undefined ? { height: typeof height === 'number' ? `${height}px` : height } : undefined
  const heightClass = height !== undefined ? '' : interactive ? 'h-80 lg:h-[420px]' : 'h-[220px]'

  if (unavailable) {
    if (fallback) return <>{fallback}</>
    return (
      <div style={style} className={cn('flex flex-col items-center justify-center gap-2 rounded-control border border-hairline-soft bg-surface-soft p-4 text-center', heightClass, className)}>
        <MapPinOff className="size-5 text-muted" aria-hidden="true" />
        <p className="text-sm text-muted">{unavailable}</p>
      </div>
    )
  }

  return (
    <div style={style} className={cn('group/map relative isolate overflow-hidden rounded-control border border-hairline-soft bg-surface-strong', heightClass, className)}>
      <div
        ref={el}
        role={interactive ? 'application' : 'img'}
        aria-roledescription="map"
        aria-label={
          label ??
          (interactive
            ? 'Map of the department area. Arrow keys pan the map; tab to the pin and use the arrow keys to move the centre.'
            : 'Map of the department area.')
        }
        className={cn(
          'absolute inset-0 z-0 font-sans! focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
          '[&_.leaflet-control-attribution]:rounded-tl-inner [&_.leaflet-control-attribution]:bg-white/85! [&_.leaflet-control-attribution]:px-1.5 [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:leading-4',
          '[&_.leaflet-control-attribution_a]:text-ink! [&_.leaflet-tile-pane]:saturate-[.6]',
          '[&_.leaflet-marker-icon:focus-visible]:rounded-control [&_.leaflet-marker-icon:focus-visible]:outline-2 [&_.leaflet-marker-icon:focus-visible]:outline-offset-2 [&_.leaflet-marker-icon:focus-visible]:outline-focus',
          !interactive && 'cursor-default! [&_.leaflet-interactive]:cursor-default!',
        )}
      />

      {interactive ? (
        // Where "Pin here" drops the pin.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 z-[500] size-7 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-has-[[data-pin-here]:hover]/map:opacity-100 group-has-[[data-pin-here]:focus-visible]/map:opacity-100 group-has-[.leaflet-container:focus-visible]/map:opacity-100"
        >
          <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 rounded-full bg-ink/70" />
          <span className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 rounded-full bg-ink/70" />
        </span>
      ) : null}

      {arrow ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute z-[900] -translate-x-1/2 -translate-y-1/2"
          style={{ left: arrow.x, top: arrow.y }}
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-canvas shadow-card" style={{ transform: `rotate(${arrow.angle}deg)` }}>
            <svg viewBox="0 0 16 16" className={cn('size-4', ARROW_CLASS[positionTone])}>
              <path d="M3 3.5 13 8 3 12.5 5.5 8Z" fill="currentColor" />
            </svg>
          </span>
          {arrowLabel ? <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-canvas/95 px-1.5 text-[11px] font-semibold tabular-nums text-ink shadow-card"
            style={{
              marginLeft: -Math.cos((arrow.angle * Math.PI) / 180) * 36,
              marginTop: -Math.sin((arrow.angle * Math.PI) / 180) * 30,
            }}
          >
            {arrow.metres >= 1000 ? `${(arrow.metres / 1000).toFixed(1)} km` : `${Math.round(arrow.metres / 10) * 10} m`}
          </span> : null}
        </span>
      ) : null}

      {!tilesShown ? (
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center bg-surface-soft" aria-hidden="true">
          <span className="flex items-center gap-2 text-sm text-muted">
            <span className="size-2 animate-pulse rounded-full bg-primary-500 motion-reduce:animate-none" />
            Loading map…
          </span>
        </div>
      ) : null}

      {ready && interactive ? (
        <>
          <div className="absolute left-3 top-3 z-[1000] flex flex-col overflow-hidden rounded-control bg-canvas shadow-card">
            <MapButton label="Zoom in" onClick={() => map()?.zoomIn()}>
              <Plus />
            </MapButton>
            <span className="mx-2 h-px bg-hairline-soft" aria-hidden="true" />
            <MapButton label="Zoom out" onClick={() => map()?.zoomOut()}>
              <Minus />
            </MapButton>
          </div>
          <div className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
            <MapButton label="Fit area" wide onClick={() => fitAll()}>
              <Scan />
              <span className="max-sm:sr-only">Fit area</span>
            </MapButton>
            {onCentreChange ? (
              <MapButton label="Move the pin to the middle of the map" wide onClick={placeHere} data-pin-here>
                <Crosshair />
                <span className="max-sm:sr-only">Pin here</span>
              </MapButton>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

function MapButton({
  label,
  onClick,
  wide,
  children,
  ...rest
}: {
  label: string
  onClick: () => void
  wide?: boolean
  children: ReactNode
  'data-pin-here'?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        'ui-press inline-flex h-11 items-center justify-center gap-1.5 bg-canvas text-sm font-semibold text-ink hover:bg-surface-soft focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus [&_svg]:size-4 [&_svg]:shrink-0',
        wide ? 'min-w-11 rounded-control shadow-card sm:px-3.5' : 'w-11',
      )}
    >
      {children}
    </button>
  )
}
