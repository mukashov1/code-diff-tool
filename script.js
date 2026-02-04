let view = 'side-by-side';

function renderDiff() {
    const oldCode = document.getElementById('oldCode').value;
    const newCode = document.getElementById('newCode').value;

    const diff = Diff.createTwoFilesPatch(
      'Original',
      'Modified',
      oldCode,
      newCode
    );
    console.log(diff);

    document.getElementById('diff').innerHTML = Diff2Html.html(diff, {
        drawFileList: false,
        outputFormat: 'side-by-side',
        matching: 'lines',
        diffStyle: 'word'
    });

    console.log(document.getElementById('diff').innerHTML);
    console.log('Diff rendered');
}

document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        renderDiff();
    }
});

renderDiff();