fn main() {
    // The manifest carries asInvoker; without it Windows treats *setup*.exe as
    // an installer and auto-elevates.
    embed_resource::compile("setup.rc", embed_resource::NONE)
        .manifest_required()
        .unwrap_or_else(|e| panic!("failed to embed setup resources: {e}"));
}
