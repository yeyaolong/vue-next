// Vue3的响应式原理
// vue2 的数组改变数组长度无法监听 3. 给对象添加不存在的值无法被响应


// proxy 兼容性差, ie11也不兼容
let toProxy = new WeakMap(); // 弱引用映射表 es6 放置的似乎 原对象:代理过的对象
let toRaw = new WeakMap();  // 被代理过的对象: 原对象
// 判断是不是对象
function isObject(target) {
    return typeof target === 'object' && target !== null
}


function reactive(target) {
    // 创建响应式对象
    return createReactiveObject(target)
}


function hasOwn(target, key) {
    return target.hasOwnProperty(key);
}

function hasChanged(oldValue, value) {
    console.log('hasChanged', oldValue, value, oldValue !== value);
    return oldValue !== value;
}

function createReactiveObject(target) {
    if (!isObject(target)) {
        return target;
    }
    let proxy = toProxy.get(target);    // 如果已经代理过了 就将代理过的结果返回即可
    if (proxy) {
        return proxy;
    }
    if (toRaw.has(target)) {    // 防止代理过的对象被代理
        return target;
    }
    let basehandler = {
        get(target, key, receiver) {
            console.log('get', key, target[key]);   // 对数组的push操作会执行两次get， 第一次是获取 Array.__proto__.push， 第二次是获取array.length
            let result = Reflect.get(target, key, receiver);            
            // 收集依赖 订阅 把当前的key 和 这个effect 对应起来

            track(target, key); // 如果目标上的 这个key 变化了 重新让数组中的effect执行即可
            return isObject(result) ? reactive(result) : result;
        },
        set(target, key, value, receiver) {
            // 怎么去识别是改属性还是新增属性
            let hadKey = hasOwn(target, key);
            let oldValue = target[key];
            let bool =  Reflect.set(target, key, value, receiver);
            // 这里的条件判断是为了防止新增属性造成多次触发
            if (!hadKey) {
                trigger(target, 'add', key)
                console.log('新增属性');
            } else if (hasChanged(oldValue, value)) {    // 这里表示属性更改过了
                trigger(target, 'update', key)
                console.log('修改属性');
            }   // 为了屏蔽无意义的修改
            // console.log('set', key, value); // 对数组的push操作会执行两次set, 第一次是array[index] = 4,第二次是array.length = 4                        
            return bool;
        },
        deleteProperty(target, key) {
            let bool = Reflect.deleteProperty(target, key);
            console.log('deleteProperty')
            return bool;
        }
    }
    let observed = new Proxy(target, basehandler);
    toProxy.set(target, observed);
    toRaw.set(observed, target);
    return observed;
}

// 栈 先进后出
let activeEffectStacks = [];    // 栈型结构
let targetsMap = new WeakMap();
function track(target, key) {   // 如果这个target中的key变化了 就执行这个effect存到栈中
    let effect = activeEffectStacks[activeEffectStacks.length - 1];
    if (effect) {  // 有对应关系才能创建关联
        let depsMap = targetsMap.get(target);
        if (!depsMap) {
            targetsMap.set(target, depsMap = new Map);
        }
        let deps = depsMap.get(key);
        if (!deps) {
            depsMap.set(key, deps = new Set());
        }
        if (!deps.has(effect)) {
            deps.add(effect);
        }        

        // 动态创建依赖关系
    }
    // 什么都不做
}

function trigger(target, type, key) {
    let depsMap = targetsMap.get(target);
    console.log('trigger')
    if (depsMap) {
        let deps = depsMap.get(key);
        if (!deps) {// 将当前key 对应的effect 依次执行
            deps.forEach(effect => {                
                effect();
            })
        }
    }
}

// 响应式
function effect(fn) {
    // 需要把fn这个函数变成响应式的函数
    let effect = createReactiveEffect(fn);
    effect();   // 默认应该先执行一次
}

function createReactiveEffect(fn) {
    let effect = function() {
        return run(effect, fn);   // 1） 让fn执行 2） 将effect存到栈中
    }
    return effect;
}

function run(effect, fn) {    // 运行fn, 将effect 存起来
    try {
        activeEffectStacks.push(effect)
        fn();   // 利用了js是单线程的
    } finally {
        activeEffectStacks.pop();
    }
}

// 依赖收集 (发布订阅)
let obj = reactive({name: 'zf'});

effect(() => {  // effect会执行两次，默认先执行一次，之后依赖的数据变化了，会再次执行
    console.log('effect1', obj.name);  // 调用proxy.get方法
})

effect(() => {  // effect会执行两次，默认先执行一次，之后依赖的数据变化了，会再次执行
    console.log('effect2', obj.name);  // 调用proxy.get方法
})

effect(() => {  // effect会执行两次，默认先执行一次，之后依赖的数据变化了，会再次执行
    console.log('effect3', obj.name);  // 调用proxy.get方法
})

effect(() => {  // effect会执行两次，默认先执行一次，之后依赖的数据变化了，会再次执行
    console.log('effect4', obj.name);  // 调用proxy.get方法
})

obj.name = 'yeyl'

// let proxy = reactive({name: 'zf', age: {n: 'z'}});

// proxy.age.n = 'jw'
// console.log('proxy.age.n', proxy.age.n)
// proxy.name
// proxy.name = 'hh'
// console.log(proxy.name)
// delete proxy.name

// let proxy = reactive([1, 2, 3]);

// proxy.push(4);  // 不需要重写 数组 方法


// let arr = [1, 2, 3];
// let proxy = reactive(arr);
// proxy.length = 100;
// proxy.push(4);

// let temp = {name: '张三'};
// let proxy2 = reactive(temp);
// proxy2.age = 10;