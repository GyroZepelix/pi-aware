#include <CoreAudio/CoreAudio.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

static int fail_with_status(const char *operation, OSStatus status) {
  fprintf(stderr, "pi-aware-mic-status: %s failed (%d)\n", operation,
          (int)status);
  return EXIT_FAILURE;
}

int main(void) {
  AudioObjectPropertyAddress process_list_address = {
      .mSelector = kAudioHardwarePropertyProcessObjectList,
      .mScope = kAudioObjectPropertyScopeGlobal,
      .mElement = kAudioObjectPropertyElementMain,
  };

  UInt32 process_list_size = 0;
  OSStatus status = AudioObjectGetPropertyDataSize(
      kAudioObjectSystemObject, &process_list_address, 0, NULL,
      &process_list_size);
  if (status != noErr) {
    return fail_with_status("process-list size query", status);
  }
  if (process_list_size % sizeof(AudioObjectID) != 0) {
    fprintf(stderr, "pi-aware-mic-status: invalid process-list size\n");
    return EXIT_FAILURE;
  }

  const size_t process_count = process_list_size / sizeof(AudioObjectID);
  if (process_count == 0) {
    puts("inactive");
    return EXIT_SUCCESS;
  }

  AudioObjectID *processes = malloc(process_list_size);
  if (processes == NULL) {
    fprintf(stderr, "pi-aware-mic-status: process-list allocation failed\n");
    return EXIT_FAILURE;
  }

  UInt32 returned_size = process_list_size;
  status = AudioObjectGetPropertyData(
      kAudioObjectSystemObject, &process_list_address, 0, NULL,
      &returned_size, processes);
  if (status != noErr) {
    free(processes);
    return fail_with_status("process-list query", status);
  }
  if (returned_size > process_list_size ||
      returned_size % sizeof(AudioObjectID) != 0) {
    free(processes);
    fprintf(stderr, "pi-aware-mic-status: invalid returned process-list size\n");
    return EXIT_FAILURE;
  }

  const size_t returned_count = returned_size / sizeof(AudioObjectID);
  size_t readable_count = 0;
  AudioObjectPropertyAddress running_input_address = {
      .mSelector = kAudioProcessPropertyIsRunningInput,
      .mScope = kAudioObjectPropertyScopeGlobal,
      .mElement = kAudioObjectPropertyElementMain,
  };

  for (size_t index = 0; index < returned_count; index += 1) {
    if (!AudioObjectHasProperty(processes[index], &running_input_address)) {
      continue;
    }

    UInt32 is_running_input = 0;
    UInt32 value_size = sizeof(is_running_input);
    status = AudioObjectGetPropertyData(
        processes[index], &running_input_address, 0, NULL, &value_size,
        &is_running_input);
    if (status == kAudioHardwareBadObjectError ||
        status == kAudioHardwareUnknownPropertyError) {
      continue;
    }
    if (status != noErr) {
      free(processes);
      return fail_with_status("running-input query", status);
    }
    if (value_size != sizeof(is_running_input)) {
      free(processes);
      fprintf(stderr, "pi-aware-mic-status: invalid running-input size\n");
      return EXIT_FAILURE;
    }

    readable_count += 1;
    if (is_running_input != 0) {
      free(processes);
      puts("active");
      return EXIT_SUCCESS;
    }
  }

  free(processes);
  if (returned_count > 0 && readable_count == 0) {
    fprintf(stderr, "pi-aware-mic-status: no readable process state\n");
    return EXIT_FAILURE;
  }

  puts("inactive");
  return EXIT_SUCCESS;
}
