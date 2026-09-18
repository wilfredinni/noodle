// Windows addons bind the stable Node-API ABI to the current host executable.
// This works for Bun source runs and renamed standalone executables without Node.
static __typeof__(&napi_create_async_work) host_napi_create_async_work;
static __typeof__(&napi_create_error) host_napi_create_error;
static __typeof__(&napi_create_external) host_napi_create_external;
static __typeof__(&napi_create_function) host_napi_create_function;
static __typeof__(&napi_create_promise) host_napi_create_promise;
static __typeof__(&napi_create_reference) host_napi_create_reference;
static __typeof__(&napi_create_string_utf8) host_napi_create_string_utf8;
static __typeof__(&napi_delete_async_work) host_napi_delete_async_work;
static __typeof__(&napi_delete_reference) host_napi_delete_reference;
static __typeof__(&napi_get_boolean) host_napi_get_boolean;
static __typeof__(&napi_get_cb_info) host_napi_get_cb_info;
static __typeof__(&napi_get_typedarray_info) host_napi_get_typedarray_info;
static __typeof__(&napi_get_undefined) host_napi_get_undefined;
static __typeof__(&napi_get_value_external) host_napi_get_value_external;
static __typeof__(&napi_get_value_string_utf8) host_napi_get_value_string_utf8;
static __typeof__(&napi_queue_async_work) host_napi_queue_async_work;
static __typeof__(&napi_reject_deferred) host_napi_reject_deferred;
static __typeof__(&napi_resolve_deferred) host_napi_resolve_deferred;
static __typeof__(&napi_set_named_property) host_napi_set_named_property;
static __typeof__(&napi_throw_error) host_napi_throw_error;
static __typeof__(&napi_throw_type_error) host_napi_throw_type_error;
static INIT_ONCE host_api_once = INIT_ONCE_STATIC_INIT;
static BOOL WINAPI bind_host_api(PINIT_ONCE once, PVOID parameter, PVOID *context) {
  (void)once; (void)parameter; (void)context;
  HMODULE host = GetModuleHandleW(NULL);
#define BIND_HOST(name) do { \
  FARPROC function = GetProcAddress(host, #name); \
  if (!function) return FALSE; \
  memcpy(&host_##name, &function, sizeof(host_##name)); \
} while (0)
  BIND_HOST(napi_create_async_work);
  BIND_HOST(napi_create_error);
  BIND_HOST(napi_create_external);
  BIND_HOST(napi_create_function);
  BIND_HOST(napi_create_promise);
  BIND_HOST(napi_create_reference);
  BIND_HOST(napi_create_string_utf8);
  BIND_HOST(napi_delete_async_work);
  BIND_HOST(napi_delete_reference);
  BIND_HOST(napi_get_boolean);
  BIND_HOST(napi_get_cb_info);
  BIND_HOST(napi_get_typedarray_info);
  BIND_HOST(napi_get_undefined);
  BIND_HOST(napi_get_value_external);
  BIND_HOST(napi_get_value_string_utf8);
  BIND_HOST(napi_queue_async_work);
  BIND_HOST(napi_reject_deferred);
  BIND_HOST(napi_resolve_deferred);
  BIND_HOST(napi_set_named_property);
  BIND_HOST(napi_throw_error);
  BIND_HOST(napi_throw_type_error);
#undef BIND_HOST
  return TRUE;
}
#define napi_create_async_work host_napi_create_async_work
#define napi_create_error host_napi_create_error
#define napi_create_external host_napi_create_external
#define napi_create_function host_napi_create_function
#define napi_create_promise host_napi_create_promise
#define napi_create_reference host_napi_create_reference
#define napi_create_string_utf8 host_napi_create_string_utf8
#define napi_delete_async_work host_napi_delete_async_work
#define napi_delete_reference host_napi_delete_reference
#define napi_get_boolean host_napi_get_boolean
#define napi_get_cb_info host_napi_get_cb_info
#define napi_get_typedarray_info host_napi_get_typedarray_info
#define napi_get_undefined host_napi_get_undefined
#define napi_get_value_external host_napi_get_value_external
#define napi_get_value_string_utf8 host_napi_get_value_string_utf8
#define napi_queue_async_work host_napi_queue_async_work
#define napi_reject_deferred host_napi_reject_deferred
#define napi_resolve_deferred host_napi_resolve_deferred
#define napi_set_named_property host_napi_set_named_property
#define napi_throw_error host_napi_throw_error
#define napi_throw_type_error host_napi_throw_type_error
