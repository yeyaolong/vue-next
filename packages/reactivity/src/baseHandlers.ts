import { reactive, readonly, toRaw, ReactiveFlags } from './reactive'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import { track, trigger, ITERATE_KEY } from './effect'
import { isObject, hasOwn, isSymbol, hasChanged, isArray } from '@vue/shared'
import { isRef } from './ref'

const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

const get = /*#__PURE__*/ createGetter()
const shallowGet = /*#__PURE__*/ createGetter(false, true)
const readonlyGet = /*#__PURE__*/ createGetter(true)
const shallowReadonlyGet = /*#__PURE__*/ createGetter(true, true)

const arrayInstrumentations: Record<string, Function> = {}
;['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
  arrayInstrumentations[key] = function(...args: any[]): any {
    const arr = toRaw(this) as any
    for (let i = 0, l = (this as any).length; i < l; i++) {
      track(arr, TrackOpTypes.GET, i + '')
    }
    // we run the method using the original args first (which may be reactive)
    const res = arr[key](...args)
    if (res === -1 || res === false) {
      // if that didn't work, run it again using raw values.
      return arr[key](...args.map(toRaw))
    } else {
      return res
    }
  }
})

function createGetter(isReadonly = false, shallow = false) {
  return function get(target: object, key: string | symbol, receiver: object) {
    if (key === ReactiveFlags.isReactive) {
      return !isReadonly
    } else if (key === ReactiveFlags.isReadonly) {
      return isReadonly
    } else if (key === ReactiveFlags.raw) {
      return target
    }

    const targetIsArray = isArray(target)
    if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
      return Reflect.get(arrayInstrumentations, key, receiver)
    }
    const res = Reflect.get(target, key, receiver)

    if (isSymbol(key) && builtInSymbols.has(key) || key === '__proto__') {
      return res
    }

    if (shallow) {
      !isReadonly && track(target, TrackOpTypes.GET, key)
      return res
    }

    if (isRef(res)) {
      if (targetIsArray) {
        !isReadonly && track(target, TrackOpTypes.GET, key)
        return res
      } else {
        // ref unwrapping, only for Objects, not for Arrays.
        // 解开ref的嵌套
        return res.value
      }
    }
    // 添加数据追踪 track(target, ....); 
    !isReadonly && track(target, TrackOpTypes.GET, key)
    // 最后这个get方法会返回一个解开对象嵌套的Ref对象
    return isObject(res)
      ? isReadonly
        ? // need to lazy access readonly and reactive here to avoid
          // circular dependency
          readonly(res)
        : reactive(res) // 如果还有深层对象，就再给深层对象做一次reactive() -> 将深层对象也改为响应式
      : res
  }
}

const set = /*#__PURE__*/ createSetter()
const shallowSet = /*#__PURE__*/ createSetter(true)

function createSetter(shallow = false) {
  /**
   * @target 目标对象(一个proxy对象)
   * @key 被改变的对象的key值
   * @value 要被设定的新值
   * @recevier ES6 语法 Reflect，如果遇到 setter，receiver则为setter调用时的this值。  https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Reflect/set
   * 
   * 
   * @return Boolean set成功 或 set失败
   */
  return function set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object
  ): boolean {
    // 在给target赋值前，先把旧值拿出来
    const oldValue = (target as any)[key]

    // 非浅数据 ---> 其实就是对象嘛
    // 如果是对象
    if (!shallow) {
      value = toRaw(value)
      if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
        // 旧值是Ref对象, 新值不是ref对象,那直接改变旧值的.value属性就好了
        // 因为ref对象取的就是.value嘛
        oldValue.value = value
        return true
      }
    } else {
      // in shallow mode, objects are set as-is regardless of reactive or not
    }

    const hadKey = hasOwn(target, key)
    const result = Reflect.set(target, key, value, receiver) // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Reflect
    // don't trigger if target is something up in the prototype chain of original
    // 如果是原型链中的某个值被改变了，请不要触发trigger
    if (target === toRaw(receiver)) {
      if (!hadKey) {
        // 与createSetter 同理，一个钩子函数. 当对象的值被改变时，会调用trigger钩子
        // 在watchEffect中的体现是, 触发setter -> 数值改变 -> 触发(调用)trigger钩子 -> trigger钩子调用 我们配置的watchEffect.options.onTrigger方法
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }
    return result
  }
}

function deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}

function has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  track(target, TrackOpTypes.HAS, key)
  return result
}

function ownKeys(target: object): (string | number | symbol)[] {
  track(target, TrackOpTypes.ITERATE, ITERATE_KEY)
  return Reflect.ownKeys(target)
}

export const mutableHandlers: ProxyHandler<object> = {
  get,
  set,
  deleteProperty,
  has,
  ownKeys
}

export const readonlyHandlers: ProxyHandler<object> = {
  get: readonlyGet,
  has,
  ownKeys,
  set(target, key) {
    if (__DEV__) {
      console.warn(
        `Set operation on key "${String(key)}" failed: target is readonly.`,
        target
      )
    }
    return true
  },
  deleteProperty(target, key) {
    if (__DEV__) {
      console.warn(
        `Delete operation on key "${String(key)}" failed: target is readonly.`,
        target
      )
    }
    return true
  }
}

export const shallowReactiveHandlers: ProxyHandler<object> = {
  ...mutableHandlers,
  get: shallowGet,
  set: shallowSet
}

// Props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.
export const shallowReadonlyHandlers: ProxyHandler<object> = {
  ...readonlyHandlers,
  get: shallowReadonlyGet
}
