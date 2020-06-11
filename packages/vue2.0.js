// Vue2.0 如何实现响应式原理
// 数据变化了可以更新视图

let oldArrayPrototype = Array.prototype;
let proto = Object.create(oldArrayPrototype);

['push','shift', 'unshift'].forEach(method => {
    proto[method] = function() {
        updateView();   // 切片编程
        oldArrayPrototype[method].call(this, ...arguments);    // 函数劫持 把函数进行重写 内部继续调用老的方法
    }
})

function observe(target) {
    if (typeof target !== 'object' || target === null) {
        return target;
    }
    if(Array.isArray(target)) {
        target.__proto__ = proto;
    }
    for (let key in target) {
        defineReactive(target,key, target[key]);        
    }
}

function defineReactive(target, key, value) {
    observe(value); // 递归
    Object.defineProperty(target, key, {
        get() {
            // get中会进行依赖收集
            return value;
        },
        set(newValue) {
            if (newValue !== value) {
                observe(newValue);
                updateView();
                value = newValue;
            }
        }
    });
}

// 问题一： 如果属性不存在 新增的属性 不是响应式的
function updateView() {
    console.log('更新视图');
}

// 使用object.defineProperty 就是可以重新定义属性 ，给属性增加 getter 和setter
let data = {
    name: 'zf',
    age: {
        n: 100,
        n2: [1, 2, 3]
    }
}



observe(data);

// data.name = 'jw';

// data.age.n = 200;

// data.age = {n: 300};
// data.age.n = 400

data.age.n2.push(4);    // 需要对 数组上的方法进行重写 