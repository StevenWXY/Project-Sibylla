import React, { Fragment } from 'react'
import { Menu, Transition } from '@headlessui/react'
import { MoreHorizontal, Shield, Pencil, Eye, Trash2 } from 'lucide-react'
import { cn } from '../../utils/cn'
import type { WorkspaceMember } from '../../../shared/types'

interface MemberRoleSelectProps {
  member: WorkspaceMember
  onRoleChange: (role: string) => void
  onRemove: () => void
  disabled?: boolean
}

const ROLE_ITEMS: Array<{ role: string; label: string; icon: React.ReactNode }> = [
  { role: 'admin', label: '设为管理员', icon: <Shield className="h-4 w-4" /> },
  { role: 'editor', label: '设为编辑者', icon: <Pencil className="h-4 w-4" /> },
  { role: 'viewer', label: '设为查看者', icon: <Eye className="h-4 w-4" /> },
]

export function MemberRoleSelect({
  member,
  onRoleChange,
  onRemove,
  disabled = false,
}: MemberRoleSelectProps) {
  return (
    <Menu as="div" className="relative">
      <Menu.Button
        className={cn(
          'rounded-lg p-1.5 text-sys-darkMuted transition-colors',
          'hover:bg-white/10 hover:text-white',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        aria-label="成员操作"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 z-10 mt-1 w-48 origin-top-right rounded-xl border border-white/10 bg-sys-darkSurface/95 py-1 shadow-glass-dark backdrop-blur-xl focus:outline-none">
          {ROLE_ITEMS.filter((item) => item.role !== member.role).map((item) => (
            <Menu.Item key={item.role}>
              {({ active }) => (
                <button
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-2 text-sm',
                    active ? 'bg-white text-black' : 'text-white',
                  )}
                  onClick={() => onRoleChange(item.role)}
                  disabled={disabled}
                >
                  <span className={cn(active ? 'text-black' : 'text-sys-darkMuted')}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              )}
            </Menu.Item>
          ))}

          <div className="my-1 border-t border-white/10" />

          <Menu.Item>
            {({ active }) => (
              <button
                className={cn(
                  'flex w-full items-center gap-2 px-4 py-2 text-sm',
                  active ? 'bg-red-600 text-white' : 'text-red-400',
                )}
                onClick={onRemove}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4" />
                移除成员
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  )
}
