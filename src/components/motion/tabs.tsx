import * as React from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { motion, MotionConfig } from 'motion/react'
import { SPRING_LAYOUT } from '#/lib/ease'

type TabsVariant = 'pill' | 'underline' | 'segment'

interface MotionTabsCtx {
  variant: TabsVariant
  listId: string
  active: string
}

const MotionTabsCtx = React.createContext<MotionTabsCtx>({
  variant: 'pill',
  listId: '',
  active: '',
})

function Tabs({
  variant = 'pill',
  defaultValue,
  value,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & { variant?: TabsVariant }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? '')
  const active = value !== undefined ? value : internalValue
  const listId = React.useId()

  const handleChange = React.useCallback(
    (v: string) => {
      if (value === undefined) setInternalValue(v)
      onValueChange?.(v)
    },
    [value, onValueChange],
  )

  return (
    <MotionTabsCtx.Provider value={{ variant, listId, active }}>
      <MotionConfig reducedMotion="user">
        <TabsPrimitive.Root value={active} onValueChange={handleChange} {...props} />
      </MotionConfig>
    </MotionTabsCtx.Provider>
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  const { variant } = React.useContext(MotionTabsCtx)
  const variantCls =
    variant === 'segment'
      ? 'bg-surface-soft rounded-xl p-1 gap-0.5'
      : variant === 'underline'
        ? 'border-b border-hairline gap-1'
        : 'gap-1'
  return (
    <TabsPrimitive.List
      className={`relative flex items-center ${variantCls}${className ? ` ${className}` : ''}`}
      {...props}
    />
  )
}

function TabsTrigger({
  value,
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { variant, listId, active } = React.useContext(MotionTabsCtx)
  const isActive = active === value

  // beui pattern: indicator sits at natural z-order (no -z-10),
  // children are wrapped in relative z-10 so they always render on top.
  const baseCls =
    'relative flex items-center justify-center text-sm font-medium cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors duration-150'

  const variantCls =
    variant === 'segment'
      ? `flex-1 px-3 py-1.5 rounded-lg ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`
      : variant === 'underline'
        ? `px-3 py-2 rounded-t-lg ${isActive ? 'text-primary-700' : 'text-muted hover:text-ink'}`
        : `px-3 py-1.5 rounded-lg ${isActive ? 'text-primary-700' : 'text-muted hover:bg-surface-soft'}`

  const indicatorCls =
    variant === 'underline'
      ? 'absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500'
      : 'absolute inset-0 rounded-lg'

  // For segment: use inline boxShadow to guarantee visibility regardless of
  // Tailwind JIT. The shadow is what makes the white card distinct from the
  // surface-soft background.
  const indicatorStyle: React.CSSProperties | undefined =
    variant === 'segment'
      ? {
          backgroundColor: 'var(--color-canvas)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.07)',
        }
      : variant === 'pill'
        ? { backgroundColor: 'var(--color-primary-100)' }
        : undefined

  return (
    <TabsPrimitive.Trigger
      value={value}
      className={`${baseCls} ${variantCls}${className ? ` ${className}` : ''}`}
      {...props}
    >
      {isActive && (
        <motion.span
          layoutId={`${listId}-ind`}
          transition={SPRING_LAYOUT}
          className={indicatorCls}
          style={indicatorStyle}
        />
      )}
      {/* relative z-10 ensures children render above the absolute indicator */}
      <span className="relative z-10 flex items-center gap-1.5">{children}</span>
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={`outline-none${className ? ` ${className}` : ''}`}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
