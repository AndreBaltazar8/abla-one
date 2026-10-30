# All of the application is Abla: this component only links its object
# (tools/build-papermono writes it).
idf_component_register(REQUIRES esp_timer esp_psram)
set(ABLA_OBJECT "${CMAKE_SOURCE_DIR}/../../../build/papermono/gallery.o")
include("${CMAKE_SOURCE_DIR}/../../../../abla-embedded/tools/idf/abla-object.cmake")
target_link_options(${COMPONENT_LIB} INTERFACE "-Wl,--defsym=_longjmp=abort")
