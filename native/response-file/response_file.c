#define _GNU_SOURCE
#define _DARWIN_C_SOURCE
#define NAPI_VERSION 8
#include "node_api.h"
#include <errno.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdatomic.h>
#ifndef ESTALE
#define ESTALE 116
#endif

#ifdef _WIN32
#include <windows.h>
#include <winternl.h>
#include "windows_node_api.h"
typedef HANDLE file_handle;
#define INVALID_FILE INVALID_HANDLE_VALUE
typedef NTSTATUS (NTAPI *nt_create_file)(PHANDLE, ACCESS_MASK, POBJECT_ATTRIBUTES,
  PIO_STATUS_BLOCK, PLARGE_INTEGER, ULONG, ULONG, ULONG, ULONG, PVOID, ULONG);
static nt_create_file create_relative;

static wchar_t *wide(const char *s) {
  int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s, -1, NULL, 0);
  if (!n) { errno = EINVAL; return NULL; }
  wchar_t *out = calloc((size_t)n, sizeof(wchar_t));
  if (!out) { errno = ENOMEM; return NULL; }
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s, -1, out, n);
  return out;
}
static int windows_error(DWORD code) {
  switch (code) {
    case ERROR_FILE_EXISTS: case ERROR_ALREADY_EXISTS: return EEXIST;
    case ERROR_FILE_NOT_FOUND: case ERROR_PATH_NOT_FOUND: return ENOENT;
    case ERROR_DIRECTORY: return ENOTDIR;
    case ERROR_DISK_FULL: case ERROR_HANDLE_DISK_FULL: return ENOSPC;
    case ERROR_NOT_ENOUGH_MEMORY: case ERROR_OUTOFMEMORY: return ENOMEM;
    default: return EACCES;
  }
}
static void close_handle(file_handle fd) { if (fd != INVALID_FILE) CloseHandle(fd); }
static int same_handle(file_handle a, file_handle b) {
  BY_HANDLE_FILE_INFORMATION x, y;
  return GetFileInformationByHandle(a, &x) && GetFileInformationByHandle(b, &y) &&
    x.dwVolumeSerialNumber == y.dwVolumeSerialNumber &&
    x.nFileIndexHigh == y.nFileIndexHigh && x.nFileIndexLow == y.nFileIndexLow;
}
static file_handle absolute_directory(const char *path) {
  wchar_t *name = wide(path);
  if (!name) return INVALID_FILE;
  file_handle fd = CreateFileW(name, FILE_TRAVERSE | FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS, NULL);
  free(name);
  if (fd == INVALID_FILE) errno = windows_error(GetLastError());
  return fd;
}
static file_handle relative_handle(file_handle parent, const char *name, int directory,
                                  int create) {
  wchar_t *value = wide(name);
  if (!value) return INVALID_FILE;
  size_t length = wcslen(value) * sizeof(wchar_t);
  if (length > UINT16_MAX) { free(value); errno = ENAMETOOLONG; return INVALID_FILE; }
  UNICODE_STRING text = {(USHORT)length, (USHORT)length, value};
  OBJECT_ATTRIBUTES attributes = {.Length = sizeof(attributes), .RootDirectory = parent,
    .ObjectName = &text, .Attributes = OBJ_CASE_INSENSITIVE};
  IO_STATUS_BLOCK status;
  file_handle fd = INVALID_FILE;
  NTSTATUS result = create_relative(&fd,
    (directory ? FILE_TRAVERSE : FILE_GENERIC_WRITE) | FILE_READ_ATTRIBUTES | SYNCHRONIZE,
    &attributes, &status, NULL, FILE_ATTRIBUTE_NORMAL,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    create ? (directory ? FILE_OPEN_IF : FILE_CREATE) : FILE_OPEN,
    (directory ? FILE_DIRECTORY_FILE : FILE_NON_DIRECTORY_FILE) |
      FILE_OPEN_REPARSE_POINT | FILE_SYNCHRONOUS_IO_NONALERT, NULL, 0);
  free(value);
  if (result < 0) {
    typedef ULONG (WINAPI *nt_error)(NTSTATUS);
    nt_error translate;
    FARPROC function = GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlNtStatusToDosError");
    memcpy(&translate, &function, sizeof(translate));
    errno = windows_error(translate(result));
    return INVALID_FILE;
  }
  FILE_ATTRIBUTE_TAG_INFO info;
  if (!GetFileInformationByHandleEx(fd, FileAttributeTagInfo, &info, sizeof(info)) ||
      (info.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) {
    close_handle(fd); errno = ELOOP; return INVALID_FILE;
  }
  return fd;
}
static file_handle duplicate_handle(file_handle fd) {
  HANDLE copy = INVALID_FILE;
  if (!DuplicateHandle(GetCurrentProcess(), fd, GetCurrentProcess(), &copy, 0, FALSE,
                       DUPLICATE_SAME_ACCESS)) errno = windows_error(GetLastError());
  return copy;
}
static file_handle open_anchor(const char *path) {
  file_handle selected = absolute_directory(path);
  if (selected == INVALID_FILE) return selected;
  DWORD length = GetFinalPathNameByHandleW(selected, NULL, 0, FILE_NAME_NORMALIZED);
  wchar_t *canonical = calloc((size_t)length + 1, sizeof(wchar_t));
  if (!canonical) { close_handle(selected); errno = ENOMEM; return INVALID_FILE; }
  if (!length || !GetFinalPathNameByHandleW(selected, canonical, length + 1, FILE_NAME_NORMALIZED)) {
    free(canonical); close_handle(selected); errno = EIO; return INVALID_FILE;
  }
  // GetFinalPathNameByHandle produces an extended drive or UNC path.
  size_t root = 0;
  if (!wcsncmp(canonical, L"\\\\?\\UNC\\", 8)) {
    wchar_t *server = wcschr(canonical + 8, L'\\');
    wchar_t *share = server ? wcschr(server + 1, L'\\') : NULL;
    root = share ? (size_t)(share - canonical + 1) : wcslen(canonical);
  } else {
    wchar_t *end = wcschr(canonical + 4, L'\\');
    root = end ? (size_t)(end - canonical + 1) : 0;
  }
  if (!root) { free(canonical); close_handle(selected); errno = EINVAL; return INVALID_FILE; }
  wchar_t saved = canonical[root]; canonical[root] = 0;
  file_handle current = CreateFileW(canonical, FILE_TRAVERSE | FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, NULL);
  canonical[root] = saved;
  for (wchar_t *part = canonical + root; current != INVALID_FILE && *part;) {
    wchar_t *end = wcschr(part, L'\\');
    if (end) *end = 0;
    int count = WideCharToMultiByte(CP_UTF8, 0, part, -1, NULL, 0, NULL, NULL);
    char *name = malloc((size_t)count);
    if (!name) { close_handle(current); current = INVALID_FILE; errno = ENOMEM; break; }
    WideCharToMultiByte(CP_UTF8, 0, part, -1, name, count, NULL, NULL);
    file_handle next = relative_handle(current, name, 1, 0);
    free(name); close_handle(current); current = next;
    if (!end) break;
    part = end + 1;
  }
  free(canonical);
  if (current != INVALID_FILE && !same_handle(selected, current)) {
    close_handle(current); current = INVALID_FILE; errno = ESTALE;
  }
  close_handle(selected);
  return current;
}
static int write_bytes(file_handle fd, const unsigned char *bytes, size_t length) {
  while (length) {
    DWORD count = 0, size = length > 1024 * 1024 ? 1024 * 1024 : (DWORD)length;
    if (!WriteFile(fd, bytes, size, &count, NULL)) { errno = windows_error(GetLastError()); return -1; }
    if (!count) { errno = EIO; return -1; }
    bytes += count; length -= count;
  }
  return 0;
}
static void remove_partial(file_handle parent, const char *name, file_handle original) {
  wchar_t *value = wide(name);
  if (!value) return;
  UNICODE_STRING text = {(USHORT)(wcslen(value) * 2), (USHORT)(wcslen(value) * 2), value};
  OBJECT_ATTRIBUTES attributes = {.Length = sizeof(attributes), .RootDirectory = parent,
    .ObjectName = &text, .Attributes = OBJ_CASE_INSENSITIVE};
  IO_STATUS_BLOCK status; HANDLE current = INVALID_FILE;
  NTSTATUS result = create_relative(&current, DELETE | FILE_READ_ATTRIBUTES | SYNCHRONIZE,
    &attributes, &status, NULL, FILE_ATTRIBUTE_NORMAL,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, FILE_OPEN,
    FILE_NON_DIRECTORY_FILE | FILE_OPEN_REPARSE_POINT | FILE_SYNCHRONOUS_IO_NONALERT, NULL, 0);
  if (result >= 0) {
    if (same_handle(original, current)) {
      FILE_DISPOSITION_INFO disposition = {TRUE};
      SetFileInformationByHandle(current, FileDispositionInfo, &disposition, sizeof(disposition));
    }
    close_handle(current);
  }
  free(value);
}
#else
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
typedef int file_handle;
#define INVALID_FILE (-1)
#ifdef __APPLE__
#define DIRECTORY_FLAGS (O_SEARCH | O_CLOEXEC)
#else
#define DIRECTORY_FLAGS (O_PATH | O_DIRECTORY | O_CLOEXEC)
#endif
static void close_handle(file_handle fd) { if (fd != INVALID_FILE) close(fd); }
static file_handle duplicate_handle(file_handle fd) { return fcntl(fd, F_DUPFD_CLOEXEC, 0); }
static int same_handle(file_handle a, file_handle b) {
  struct stat x, y;
  return !fstat(a, &x) && !fstat(b, &y) && x.st_dev == y.st_dev && x.st_ino == y.st_ino;
}
static file_handle absolute_directory(const char *path) { return open(path, DIRECTORY_FLAGS); }
static file_handle relative_handle(file_handle parent, const char *name, int directory,
                                  int create) {
  int flags = directory ? DIRECTORY_FLAGS : O_WRONLY | O_CLOEXEC;
  flags |= O_NOFOLLOW;
  if (!directory && create) flags |= O_CREAT | O_EXCL;
  int fd = openat(parent, name, flags, 0600);
  if (directory && create && fd < 0 && errno == ENOENT) {
    if (mkdirat(parent, name, 0777) < 0 && errno != EEXIST) return INVALID_FILE;
    fd = openat(parent, name, flags, 0);
  }
  return fd;
}
static file_handle open_anchor(const char *path) {
  int selected = absolute_directory(path);
  if (selected < 0) return selected;
  char *canonical = realpath(path, NULL);
  if (!canonical) { int error = errno; close_handle(selected); errno = error; return INVALID_FILE; }
  int current = open("/", DIRECTORY_FLAGS | O_NOFOLLOW);
  char *save = NULL;
  for (char *part = strtok_r(canonical, "/", &save); part && current >= 0;
       part = strtok_r(NULL, "/", &save)) {
    int next = relative_handle(current, part, 1, 0);
    int error = errno; close_handle(current); current = next; errno = error;
  }
  free(canonical);
  if (current >= 0 && !same_handle(selected, current)) {
    close_handle(current); current = INVALID_FILE; errno = ESTALE;
  }
  int error = errno; close_handle(selected); errno = error;
  return current;
}
static int write_bytes(file_handle fd, const unsigned char *bytes, size_t length) {
  while (length) {
    size_t chunk = length > 1024 * 1024 ? 1024 * 1024 : length;
    ssize_t count = write(fd, bytes, chunk);
    if (count < 0) { if (errno == EINTR) continue; return -1; }
    if (!count) { errno = EIO; return -1; }
    bytes += count; length -= (size_t)count;
  }
  return 0;
}
static void remove_partial(file_handle parent, const char *name, file_handle original) {
  struct stat file, current;
  if (!fstat(original, &file) && !fstatat(parent, name, &current, AT_SYMLINK_NOFOLLOW) &&
      file.st_dev == current.st_dev && file.st_ino == current.st_ino)
    unlinkat(parent, name, 0);
}
#endif

typedef struct resource {
  file_handle fd, parent;
  char *name;
  int busy;
  struct resource *next;
} resource;
// Validate opaque external handles without dereferencing another addon's externals.
static resource *resources;
static atomic_flag resources_lock = ATOMIC_FLAG_INIT;
static void lock_resources(void) {
  while (atomic_flag_test_and_set_explicit(&resources_lock, memory_order_acquire)) {}
}
static void unlock_resources(void) {
  atomic_flag_clear_explicit(&resources_lock, memory_order_release);
}
static void release(resource *r) {
  close_handle(r->fd); close_handle(r->parent);
  r->fd = r->parent = INVALID_FILE;
}
static void finalize(napi_env env, void *value, void *hint) {
  (void)env; (void)hint;
  resource *r = value;
  lock_resources();
  resource **entry = &resources;
  while (*entry && *entry != r) entry = &(*entry)->next;
  if (*entry) *entry = r->next;
  unlock_resources();
  release(r); free(r->name); free(r);
}
static resource *get_resource(napi_env env, napi_value value) {
  void *pointer = NULL;
  if (napi_get_value_external(env, value, &pointer) == napi_ok) {
    lock_resources();
    for (resource *r = resources; r; r = r->next) if (r == pointer) {
      unlock_resources(); return r;
    }
    unlock_resources();
  }
  napi_throw_type_error(env, NULL, "Invalid response file handle"); return NULL;
}
static char *get_string(napi_env env, napi_value value, int component) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, NULL, 0, &length) != napi_ok) {
    napi_throw_type_error(env, NULL, "Expected a path string"); return NULL;
  }
  char *text = malloc(length + 1);
  if (!text) { napi_throw_error(env, "ENOMEM", "Unable to allocate path"); return NULL; }
  napi_get_value_string_utf8(env, value, text, length + 1, &length);
  if (!length || strlen(text) != length ||
      (component && (!strcmp(text, ".") || !strcmp(text, "..") || strchr(text, '/')
#ifdef _WIN32
                    || strchr(text, '\\') || strchr(text, ':')
#endif
                    ))) {
    free(text); napi_throw_type_error(env, NULL, "Invalid path component"); return NULL;
  }
  return text;
}
enum operation {ANCHOR, DESCEND, CREATE, WRITE, CLEANUP, CHECK};
typedef struct task {
  enum operation operation;
  resource *input, *output;
  napi_ref reference;
  napi_async_work work;
  napi_deferred deferred;
  char *name;
  unsigned char *bytes;
  size_t length;
  int error, matches;
} task;
static void execute(napi_env env, void *value) {
  (void)env;
  task *t = value;
  file_handle fd = INVALID_FILE;
  switch (t->operation) {
    case ANCHOR: fd = open_anchor(t->name); break;
    case DESCEND: fd = relative_handle(t->input->fd, t->name, 1, 1); break;
    case CREATE: fd = relative_handle(t->input->fd, t->name, 0, 1); break;
    case WRITE:
      if (write_bytes(t->input->fd, t->bytes, t->length)) t->error = errno;
      return;
    case CLEANUP: remove_partial(t->input->parent, t->input->name, t->input->fd); return;
    case CHECK:
      fd = absolute_directory(t->name);
      t->matches = fd != INVALID_FILE && same_handle(t->input->fd, fd);
      close_handle(fd); return;
  }
  if (fd == INVALID_FILE) { t->error = errno; return; }
  t->output = calloc(1, sizeof(resource));
  if (!t->output) { close_handle(fd); t->error = ENOMEM; return; }
  t->output->fd = fd; t->output->parent = INVALID_FILE;
  if (t->operation == CREATE) {
    t->output->parent = duplicate_handle(t->input->fd);
    t->output->name = strdup(t->name);
    if (t->output->parent == INVALID_FILE || !t->output->name) {
      t->error = errno ? errno : ENOMEM;
      remove_partial(t->input->fd, t->name, fd);
      release(t->output); free(t->output->name); free(t->output); t->output = NULL;
    }
  }
}
static const char *error_code(int error) {
  switch (error) {
    case EEXIST: return "EEXIST"; case ENOENT: return "ENOENT";
    case ENOTDIR: return "ENOTDIR"; case ELOOP: return "ELOOP";
    case ESTALE: return "ESTALE"; case ENOSPC: return "ENOSPC";
    case ENOMEM: return "ENOMEM"; case EACCES: return "EACCES";
    default: return "EIO";
  }
}
static void complete(napi_env env, napi_status status, void *value) {
  task *t = value;
  if (t->input) t->input->busy = 0;
  if (status != napi_ok && !t->error) t->error = EIO;
  napi_value result;
  if (t->error) {
    napi_value message, code;
    napi_create_string_utf8(env, strerror(t->error), NAPI_AUTO_LENGTH, &message);
    napi_create_error(env, NULL, message, &result);
    napi_create_string_utf8(env, error_code(t->error), NAPI_AUTO_LENGTH, &code);
    napi_set_named_property(env, result, "code", code);
    if (t->output) { release(t->output); free(t->output->name); free(t->output); }
    napi_reject_deferred(env, t->deferred, result);
  } else {
    if (t->output) {
      lock_resources();
      t->output->next = resources; resources = t->output;
      unlock_resources();
      napi_create_external(env, t->output, finalize, NULL, &result);
    } else if (t->operation == CHECK) napi_get_boolean(env, t->matches, &result);
    else napi_get_undefined(env, &result);
    napi_resolve_deferred(env, t->deferred, result);
  }
  if (t->reference) napi_delete_reference(env, t->reference);
  napi_delete_async_work(env, t->work);
  free(t->name); free(t->bytes); free(t);
}
static napi_value schedule(napi_env env, napi_callback_info info) {
  napi_value args[2], label, promise;
  size_t argc = 2; void *data;
  napi_get_cb_info(env, info, &argc, args, NULL, &data);
  enum operation operation = (enum operation)(uintptr_t)data;
  if (argc != (operation == ANCHOR || operation == CLEANUP ? 1u : 2u)) {
    napi_throw_type_error(env, NULL, "Invalid response file arguments"); return NULL;
  }
  task *t = calloc(1, sizeof(task));
  if (!t) { napi_throw_error(env, "ENOMEM", "Unable to allocate operation"); return NULL; }
  t->operation = operation;
  if (operation != ANCHOR) {
    t->input = get_resource(env, args[0]);
    if (!t->input) { free(t); return NULL; }
    if (t->input->fd == INVALID_FILE || t->input->busy) {
      free(t); napi_throw_error(env, "EBUSY", "Response file handle is closed or in use"); return NULL;
    }
  }
  if (operation == ANCHOR || operation == DESCEND || operation == CREATE || operation == CHECK) {
    t->name = get_string(env, args[operation == ANCHOR ? 0 : 1], operation != ANCHOR && operation != CHECK);
    if (!t->name) { free(t); return NULL; }
  } else if (operation == WRITE) {
    napi_typedarray_type type; void *bytes; napi_value buffer; size_t offset;
    if (napi_get_typedarray_info(env, args[1], &type, &t->length, &bytes, &buffer, &offset) != napi_ok ||
        type != napi_uint8_array) {
      free(t); napi_throw_type_error(env, NULL, "Expected response bytes"); return NULL;
    }
    // Own a snapshot: the caller may mutate or detach the Uint8Array during async I/O.
    t->bytes = malloc(t->length ? t->length : 1);
    if (!t->bytes) { free(t); napi_throw_error(env, "ENOMEM", "Unable to allocate response snapshot"); return NULL; }
    if (t->length) memcpy(t->bytes, bytes, t->length);
  }
  napi_create_string_utf8(env, "noodle.response-file", NAPI_AUTO_LENGTH, &label);
  napi_status status = napi_create_promise(env, &t->deferred, &promise);
  if (status == napi_ok && t->input) status = napi_create_reference(env, args[0], 1, &t->reference);
  if (status == napi_ok) status = napi_create_async_work(env, NULL, label, execute, complete, t, &t->work);
  if (status == napi_ok) status = napi_queue_async_work(env, t->work);
  if (status != napi_ok) {
    if (t->reference) napi_delete_reference(env, t->reference);
    if (t->work) napi_delete_async_work(env, t->work);
    free(t->name); free(t->bytes); free(t);
    napi_throw_error(env, "EIO", "Unable to schedule response file operation"); return NULL;
  }
  if (t->input) t->input->busy = 1;
  return promise;
}
static napi_value close_resource(napi_env env, napi_callback_info info) {
  napi_value value, result; size_t argc = 1;
  napi_get_cb_info(env, info, &argc, &value, NULL, NULL);
  if (argc != 1) { napi_throw_type_error(env, NULL, "Expected response file handle"); return NULL; }
  resource *r = get_resource(env, value);
  if (!r) return NULL;
  if (r->busy) { napi_throw_error(env, "EBUSY", "Response file handle is in use"); return NULL; }
  release(r); napi_get_undefined(env, &result); return result;
}
NAPI_MODULE_INIT() {
#ifdef _WIN32
  if (!InitOnceExecuteOnce(&host_api_once, bind_host_api, NULL, NULL)) return NULL;
  FARPROC function = GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtCreateFile");
  memcpy(&create_relative, &function, sizeof(create_relative));
  if (!create_relative) { napi_throw_error(env, "ENOSYS", "NtCreateFile is unavailable"); return NULL; }
#endif
  const char *names[] = {"openAnchor", "descend", "create", "write", "cleanup", "matches"};
  for (uintptr_t i = 0; i < 6; i++) {
    napi_value fn;
    napi_create_function(env, names[i], NAPI_AUTO_LENGTH, schedule, (void *)i, &fn);
    napi_set_named_property(env, exports, names[i], fn);
  }
  napi_value fn;
  napi_create_function(env, "close", NAPI_AUTO_LENGTH, close_resource, NULL, &fn);
  napi_set_named_property(env, exports, "close", fn);
  return exports;
}
