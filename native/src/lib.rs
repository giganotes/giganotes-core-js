use std::sync::mpsc::{self, RecvTimeoutError, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use neon::context::{Context, TaskContext};
use neon::object::Object;
use neon::result::JsResult;
use neon::task::Task;
use neon::types::{JsFunction, JsUndefined, JsValue};
use neon::{declare_types, register_module};
use neon::prelude::*;
use giganotes_core::core::*;
use simple_logger::SimpleLogger;
use log::{info, LevelFilter};

fn init_logging(mut cx: FunctionContext) -> JsResult<JsString> {
    SimpleLogger::new().with_level(LevelFilter::Debug).init().unwrap();
    Ok(cx.string("OK"))
}

fn handle_core_command(mut cx: FunctionContext) -> JsResult<JsArrayBuffer> {    
    let mut v: Vec<u8> = Vec::new();
    let b: Handle<JsArrayBuffer> = cx.argument(0)?;    
    let command_index = cx.argument::<JsNumber>(1)?.value() as i8;   
    cx.borrow(&b, |slice| {
        let len = slice.len();
        let data = slice.as_slice::<u8>();
        v = handle_command(command_index, data, len);    
    });

    let mut output = JsArrayBuffer::new(&mut cx, v.len() as u32)?;
    cx.borrow_mut(&mut output, |slice| {
        let data = slice.as_mut_slice::<u8>();  
        for (i, x) in v.iter().enumerate() {
            data[i] = *x;
        }
    });    

    Ok(output)
}


fn handle_async_core_command(mut cx: FunctionContext) -> JsResult<JsArrayBuffer> {    
    let mut v: Vec<u8> = Vec::new();
    let b: Handle<JsArrayBuffer> = cx.argument(0)?;    
    let command_index = cx.argument::<JsNumber>(1)?.value() as i8;   
    cx.borrow(&b, |slice| {
        let len = slice.len();
        let data = slice.as_slice::<u8>();
        v = handle_async_command(command_index, data, len);    
    });

    let mut output = JsArrayBuffer::new(&mut cx, v.len() as u32)?;
    cx.borrow_mut(&mut output, |slice| {
        let data = slice.as_mut_slice::<u8>();  
        for (i, x) in v.iter().enumerate() {
            data[i] = *x;
        }
    });    

    Ok(output)
}

// Reading from a channel `Receiver` is a blocking operation. This struct
// wraps the data required to perform a read asynchronously from a libuv
// thread.
pub struct EventEmitterTask(Arc<Mutex<mpsc::Receiver<Vec<u8>>>>);

// Implementation of a neon `Task` for `EventEmitterTask`. This task reads
// from the events channel and calls a JS callback with the data.
impl Task for EventEmitterTask {
    type Output = Option<Vec<u8>>;
    type Error = String;
    type JsEvent = JsValue;

    // The work performed on the `libuv` thread. First acquire a lock on
    // the receiving thread and then return the received data.
    // In practice, this should never need to wait for a lock since it
    // should only be executed one at a time by the `EventEmitter` class.
    fn perform(&self) -> Result<Self::Output, Self::Error> {
        let rx = self
            .0
            .lock()
            .map_err(|_| "Could not obtain lock on receiver".to_string())?;
        
        // Attempt to read from the channel. Block for at most 100 ms.
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(event) => Ok(Some(event)),
            Err(RecvTimeoutError::Timeout) => Ok(None),
            Err(RecvTimeoutError::Disconnected) => Err("Failed to receive event".to_string()),
        }
    }

    // After the `perform` method has returned, the `complete` method is
    // scheduled on the main thread. It is responsible for converting the
    // Rust data structure into a JS object.
    fn complete(
        self,
        mut cx: TaskContext,
        event: Result<Self::Output, Self::Error>,
    ) -> JsResult<JsValue> {
        
        // Receive the event or return early with the error
        let event = event.or_else(|err| cx.throw_error(&err.to_string()))?;

        // Timeout occured, return early with `undefined
        let result = match event {
            Some(result) => result,
            None => {
                return Ok(JsUndefined::new().upcast())                
            },
        };
        
        // Create an empty object `{}`
        let o = cx.empty_object();

        let event_name = cx.string("coreEvent");                

        let mut output = JsArrayBuffer::new(&mut cx, result.len() as u32)?;
        cx.borrow_mut(&mut output, |slice| {
            let data = slice.as_mut_slice::<u8>();  
            for (i, x) in result.iter().enumerate() {
                data[i] = *x;
            }
        });   

        o.set(&mut cx, "event", event_name)?;
        o.set(&mut cx, "data", output)?;

        Ok(o.upcast())        
    }
}

// Rust struct that holds the data required by the `JsEventEmitter` class.
pub struct EventEmitter {
    // Since the `Receiver` is sent to a thread and mutated, it must be
    // `Send + Sync`. Since, correct usage of the `poll` interface should
    // only have a single concurrent consume, we guard the channel with a
    // `Mutex`.
    events: Arc<Mutex<mpsc::Receiver<Vec<u8>>>>,

    // Channel used to perform a controlled shutdown of the work thread.
    shutdown: mpsc::Sender<()>,
}

// Implementation of the `JsEventEmitter` class. This is the only public
// interface of the Rust code. It exposes the `poll` and `shutdown` methods
// to JS.
declare_types! {
    pub class JsEventEmitter for EventEmitter {
        // Called by the `JsEventEmitter` constructor
        init(_) {
            let (shutdown, shutdown_rx) = mpsc::channel();
            
            // Start work in a separate thread
            //let rx = event_thread(shutdown_rx);
                        
            // Construct a new `EventEmitter` to be wrapped by the class.
            Ok(EventEmitter {
                events: WORKER.receiver.clone(),
                shutdown,
            })
        }

        // This method should be called by JS to receive data. It accepts a
        // `function (err, data)` style asynchronous callback. It may be called
        // in a loop, but care should be taken to only call it once at a time.
        method poll(mut cx) {
            
            // The callback to be executed when data is available
            let cb = cx.argument::<JsFunction>(0)?;
            let this = cx.this();

            // Create an asynchronously `EventEmitterTask` to receive data
            let events = cx.borrow(&this, |emitter| Arc::clone(&emitter.events));
            let emitter = EventEmitterTask(events);

            // Schedule the task on the `libuv` thread pool
            emitter.schedule(cb);

            // The `poll` method does not return any data.
            Ok(JsUndefined::new().upcast())
        }

        // The shutdown method may be called to stop the Rust thread. It
        // will error if the thread has already been destroyed.
        method shutdown(mut cx) {
            let this = cx.this();

            // Unwrap the shutdown channel and send a shutdown command
            cx.borrow(&this, |emitter| emitter.shutdown.send(()))
                .or_else(|err| cx.throw_error(&err.to_string()))?;

            Ok(JsUndefined::new().upcast())
        }
    }
}

register_module!(mut m, {
    m.export_function("initLogging", init_logging)?; 
    m.export_function("handleCommand", handle_core_command)?;
    m.export_function("handleAsyncCommand", handle_async_core_command)?;
    m.export_class::<JsEventEmitter>("RustChannel")?;
    Ok(())
});
