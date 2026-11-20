//! Command-line argument handling for double-click imports.
//!
//! When a `.cart` file is opened from the OS shell, its path arrives as a
//! command-line argument. Nothing else about the arguments is interesting:
//! anything that does not look like an existing cart archive is ignored.

use std::path::PathBuf;

/// Every argument that points at an existing `.cart` file, in order.
///
/// The extension is matched case-insensitively (`DOOM.CART` counts); the
/// executable path that precedes the real arguments does not match, so raw
/// `argv` (including the single-instance callback form, which repeats it) can
/// be passed as-is.
pub fn cart_paths<I>(args: I) -> Vec<PathBuf>
where
    I: IntoIterator,
    I::Item: AsRef<str>,
{
    args.into_iter()
        .map(|arg| PathBuf::from(arg.as_ref()))
        .filter(|path| path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("cart")))
        .filter(|path| path.is_file())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::cart_paths;
    use std::fs;
    use std::path::PathBuf;

    fn temp_file(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(name);
        fs::write(&path, b"cart").expect("failed to write the temp cart");
        path
    }

    #[test]
    fn keeps_only_existing_cart_files() {
        let cart = temp_file("retrium-cli-test.cart");
        let upper = temp_file("retrium-cli-test-upper.CART");

        let paths = cart_paths([
            "retrium.exe".to_string(),
            cart.to_string_lossy().to_string(),
            upper.to_string_lossy().to_string(),
            "missing.cart".to_string(),
            "C:\\games\\readme.txt".to_string(),
            String::new(),
        ]);

        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&cart));
        assert!(paths.contains(&upper));

        fs::remove_file(cart).ok();
        fs::remove_file(upper).ok();
    }

    #[test]
    fn ignores_non_cart_extensions() {
        let note = temp_file("retrium-cli-test.txt");
        assert!(cart_paths([note.to_string_lossy().to_string()]).is_empty());
        fs::remove_file(note).ok();
    }
}
